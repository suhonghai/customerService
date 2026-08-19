import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FileStorageProvider } from '../../common/services/file-storage.service';
import { SplitterService } from '../../common/services/splitter.service';
import { EmbeddingService } from '../../common/services/embedding.service';
import { parsePdf } from '../../common/services/pdf-parser.util';
import { FaqChromaService } from './faq-chroma.service';
import { UploadFaqDto } from './dto/upload-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { QueryFaqDto } from './dto/query-faq.dto';
import { ReviewFaqDto } from './dto/review-faq.dto';

const ALLOWED_EXT = new Set(['.md', '.txt', '.pdf']);

/**
 * FaqService(Day 5)
 *
 * 8 个核心流程:
 * - list:分页 + 筛选
 * - detail:含所有版本
 * - upload:multipart 创建文档 + 第一版本(status=1 待审核)
 * - update:改元数据
 * - uploadVersion:multipart 新版本
 * - review:发布触发 Chroma 入库 / 下线触发 Chroma 删除
 * - delete:软删文档 + Chroma 全删
 * - listVersions:该文档的所有版本
 *
 * 关键依赖:
 * - FileStorageProvider('FILE_STORAGE'):落盘
 * - SplitterService:文本切片
 * - EmbeddingService:百炼 embed
 * - FaqChromaService:Chroma 读写
 */
@Injectable()
export class FaqService {
  private readonly logger = new Logger(FaqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly splitter: SplitterService,
    private readonly embedding: EmbeddingService,
    private readonly chroma: FaqChromaService,
    @Inject('FILE_STORAGE') private readonly fileStorage: FileStorageProvider,
  ) {}

  // ============================================================
  // GET /api/faq
  // ============================================================
  async list(query: QueryFaqDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.FaqDocumentWhereInput = { deletedAt: null };
    if (query.category) where.category = query.category;
    if (query.status !== undefined) where.status = query.status;
    if (query.keyword) {
      where.OR = [
        { title: { contains: query.keyword } },
        { description: { contains: query.keyword } },
        { tags: { contains: query.keyword } },
      ];
    }
    const orderBy: Prisma.FaqDocumentOrderByWithRelationInput = {
      [query.sortBy ?? 'id']: query.sortOrder ?? 'desc',
    } as Prisma.FaqDocumentOrderByWithRelationInput;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.faqDocument.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          uploader: { select: { id: true, username: true, nickname: true } },
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
            select: {
              id: true,
              version: true,
              status: true,
              chunkCount: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.faqDocument.count({ where }),
    ]);

    return {
      list: rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        tags: r.tags,
        description: r.description,
        status: r.status,
        currentVersion: r.currentVersion,
        uploader: r.uploader,
        latestVersion: r.versions[0] ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  // ============================================================
  // GET /api/faq/:id
  // ============================================================
  async getById(id: number) {
    const doc = await this.prisma.faqDocument.findUnique({
      where: { id },
      include: {
        uploader: { select: { id: true, username: true, nickname: true } },
        versions: {
          orderBy: { version: 'desc' },
          include: {
            reviewer: { select: { id: true, username: true, nickname: true } },
          },
        },
      },
    });
    if (!doc || doc.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    return doc;
  }

  // ============================================================
  // GET /api/faq/:id/versions
  // ============================================================
  async listVersions(id: number) {
    // 校验文档存在
    const doc = await this.prisma.faqDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    return this.prisma.faqVersion.findMany({
      where: { documentId: id },
      orderBy: { version: 'desc' },
      include: {
        reviewer: { select: { id: true, username: true, nickname: true } },
      },
    });
  }

  // ============================================================
  // POST /api/faq/upload
  //   - 创建文档 + 第一版本(status=1 待审核)
  //   - SHA256 校验重复
  // ============================================================
  async upload(file: Express.Multer.File, dto: UploadFaqDto, uploaderId: number) {
    this.validateFile(file);
    const checksum = this.sha256(file.buffer);

    // SHA256 重复检查
    const dup = await this.prisma.faqVersion.findFirst({
      where: { checksum },
    });
    if (dup) {
      throw new BizException(
        BizCode.USERNAME_EXISTS,
        `文件重复:checksum=${checksum.slice(0, 12)}...,已存在版本 id=${dup.id}`,
      );
    }

    // 落盘
    const storagePath = await this.fileStorage.save(file.buffer, file.originalname, 'faq');

    // 创建文档 + 第一版本(事务)
    const result = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.faqDocument.create({
        data: {
          title: dto.title,
          category: dto.category ?? null,
          tags: dto.tags ?? null,
          description: dto.description ?? null,
          uploaderId,
          currentVersion: 1,
          status: 1, // 文档级状态:待审核(取最新版本状态)
        },
      });
      const version = await tx.faqVersion.create({
        data: {
          documentId: doc.id,
          version: 1,
          filePath: storagePath,
          fileSize: file.size,
          checksum,
          chunkCount: 0,
          changelog: dto.changelog ?? null,
          status: 1, // 1 待审核
        },
      });
      // file_meta 记录
      await tx.fileMeta.create({
        data: {
          originalName: file.originalname,
          storagePath,
          storageType: 'local',
          url: this.fileStorage.getUrl(storagePath),
          mimeType: file.mimetype || 'application/octet-stream',
          fileSize: file.size,
          checksum,
          uploaderId,
          businessType: 'faq',
          businessId: String(doc.id),
        },
      });
      return { doc, version };
    });

    return {
      documentId: result.doc.id,
      versionId: result.version.id,
      version: result.version.version,
      fileSize: result.version.fileSize,
      checksum: result.version.checksum,
      status: result.version.status,
      storagePath,
    };
  }

  // ============================================================
  // PUT /api/faq/:id
  //   - 只改元数据
  // ============================================================
  async update(id: number, dto: UpdateFaqDto) {
    const exist = await this.prisma.faqDocument.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    const updated = await this.prisma.faqDocument.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        category: dto.category ?? undefined,
        tags: dto.tags ?? undefined,
        description: dto.description ?? undefined,
      },
    });
    return updated;
  }

  // ============================================================
  // POST /api/faq/:id/upload-version
  //   - 新版本,version = max + 1
  //   - status = 1 待审核
  // ============================================================
  async uploadVersion(id: number, file: Express.Multer.File, dto: UploadFaqDto) {
    this.validateFile(file);
    const doc = await this.prisma.faqDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    const checksum = this.sha256(file.buffer);

    // 重复检查(同 checksum 任意版本存在即拒)
    const dup = await this.prisma.faqVersion.findFirst({ where: { checksum } });
    if (dup) {
      throw new BizException(
        BizCode.USERNAME_EXISTS,
        `文件重复:checksum=${checksum.slice(0, 12)}...,已存在版本 id=${dup.id}`,
      );
    }

    const storagePath = await this.fileStorage.save(file.buffer, file.originalname, 'faq');

    const result = await this.prisma.$transaction(async (tx) => {
      // 取当前最大 version
      const max = await tx.faqVersion.findFirst({
        where: { documentId: id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (max?.version ?? 0) + 1;
      const version = await tx.faqVersion.create({
        data: {
          documentId: id,
          version: nextVersion,
          filePath: storagePath,
          fileSize: file.size,
          checksum,
          chunkCount: 0,
          changelog: dto.changelog ?? null,
          status: 1, // 待审核
        },
      });
      // 更新文档元数据(允许上传新版本时顺便改 title / category 等)
      await tx.faqDocument.update({
        where: { id },
        data: {
          title: dto.title ?? undefined,
          category: dto.category ?? undefined,
          tags: dto.tags ?? undefined,
          description: dto.description ?? undefined,
          currentVersion: nextVersion,
          status: 1, // 文档级状态:有未审核版本
        },
      });
      // file_meta 记录
      await tx.fileMeta.create({
        data: {
          originalName: file.originalname,
          storagePath,
          storageType: 'local',
          url: this.fileStorage.getUrl(storagePath),
          mimeType: file.mimetype || 'application/octet-stream',
          fileSize: file.size,
          checksum,
          uploaderId: doc.uploaderId,
          businessType: 'faq',
          businessId: String(id),
        },
      });
      return version;
    });

    return {
      documentId: id,
      versionId: result.id,
      version: result.version,
      fileSize: result.fileSize,
      checksum: result.checksum,
      status: result.status,
      storagePath,
    };
  }

  // ============================================================
  // POST /api/faq/:id/review
  //   - status=2 发布 → 切片 → embed → Chroma 写入
  //   - status=3 下线 → Chroma 删除
  // ============================================================
  async review(id: number, dto: ReviewFaqDto, reviewerId: number, reviewerName: string) {
    const doc = await this.prisma.faqDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    const version = await this.prisma.faqVersion.findUnique({
      where: { id: dto.versionId },
    });
    if (!version || version.documentId !== id) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, '版本不存在或不属于该文档');
    }
    if (version.status !== 1 && version.status !== 2) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        `版本状态为 ${version.status},不可再审核(1待审核 / 2已发布 / 3已下线)`,
      );
    }
    // 状态机:
    // - 1 待审核 → 2 发布 / 3 下线(正常审核)
    // - 2 已发布 → 3 下线(撤回发布,Day 5 允许这种操作)
    if (version.status === 2 && dto.status !== 3) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, `已发布版本只能下线(status=3),不能改回其它`);
    }
    if (version.status === 1 && dto.status === 3) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, `待审核版本不能直接下线,需先发布或删除`);
    }
    if (dto.status !== 2 && dto.status !== 3) {
      throw new BizException(BizCode.PARAM_ERROR, 'status 必须为 2/3');
    }

    let chunkCount = 0;

    if (dto.status === 2) {
      // 发布:切片 → embed → Chroma 写入
      try {
        const text = await this.readVersionText(version.filePath);
        const chunks = this.splitter.split(text);
        this.logger.log(
          `review publish: docId=${id} v=${version.version} chunks=${chunks.length} (${text.length} chars)`,
        );
        if (chunks.length > 0) {
          const embeddings = await this.embedding.embed(chunks);
          await this.chroma.addChunks(
            id,
            version.version,
            doc.title,
            doc.category ?? '',
            chunks,
            embeddings,
          );
          chunkCount = chunks.length;
        }
      } catch (e) {
        this.logger.error(
          `Chroma 入库失败: docId=${id} v=${version.version}: ${(e as Error).message}`,
        );
        throw new BizException(BizCode.SERVER_ERROR, `Chroma 入库失败:${(e as Error).message}`);
      }
    } else if (dto.status === 3) {
      // 下线:Chroma 删除
      try {
        await this.chroma.deleteByDocVersion(id, version.version);
        chunkCount = 0;
      } catch (e) {
        this.logger.warn(`Chroma 删除失败(继续审核): ${(e as Error).message}`);
        chunkCount = 0;
      }
    }

    // 更新 faq_version + faq_document
    await this.prisma.$transaction(async (tx) => {
      await tx.faqVersion.update({
        where: { id: dto.versionId },
        data: {
          status: dto.status,
          reviewerId,
          reviewedAt: new Date(),
          chunkCount,
        },
      });
      // 文档级 status:取最新版本状态
      const latestVer = await tx.faqVersion.findFirst({
        where: { documentId: id },
        orderBy: { version: 'desc' },
        select: { status: true, version: true },
      });
      if (latestVer && latestVer.version === version.version) {
        await tx.faqDocument.update({
          where: { id },
          data: { status: dto.status },
        });
      }
    });

    void this.audit.create({
      userId: reviewerId,
      username: reviewerName,
      module: 'faq',
      action: dto.status === 2 ? 'review-publish' : 'review-offline',
      resource: 'faq_version',
      resourceId: String(dto.versionId),
      method: 'POST',
      path: `/api/faq/${id}/review`,
      status: 1,
    });

    return {
      versionId: dto.versionId,
      status: dto.status,
      chunkCount,
    };
  }

  // ============================================================
  // 取文档最新版本 id(供 controller 别名路由 /publish /offline 自动选版本用)
  // ============================================================
  async getLatestVersionId(id: number): Promise<number> {
    const latest = await this.prisma.faqVersion.findFirst({
      where: { documentId: id },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (!latest) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, '文档没有任何版本');
    }
    return latest.id;
  }

  // ============================================================
  // DELETE /api/faq/:id
  //   - 软删文档 + Chroma 全删
  // ============================================================
  async delete(id: number) {
    const doc = await this.prisma.faqDocument.findUnique({ where: { id } });
    if (!doc || doc.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'FAQ 文档不存在');
    }
    // 先删 Chroma(失败不阻断)
    try {
      await this.chroma.deleteByDoc(id);
    } catch (e) {
      this.logger.warn(`Chroma deleteByDoc failed for docId=${id}: ${(e as Error).message}`);
    }
    await this.prisma.faqDocument.delete({ where: { id } });
    return { id };
  }

  // ============================================================
  // 内部 helper
  // ============================================================

  private validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BizException(BizCode.PARAM_MISSING, 'file 必传');
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw new BizException(
        BizCode.PARAM_MISSING,
        `不支持的文件类型:${ext},仅允许 .md / .txt / .pdf`,
      );
    }
    if (file.size === 0) {
      throw new BizException(BizCode.PARAM_ERROR, '文件为空');
    }
  }

  private sha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * 读文件 → 文本(.md/.txt 直读,.pdf 用 unpdf)
   */
  private async readVersionText(filePath: string): Promise<string> {
    const buf = await this.fileStorage.read(filePath);
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      return parsePdf(buf);
    }
    return buf.toString('utf8');
  }
}
