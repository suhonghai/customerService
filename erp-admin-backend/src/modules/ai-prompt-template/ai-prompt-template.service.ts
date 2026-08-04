import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { CreateAiPromptTemplateDto } from './dto/create-ai-prompt-template.dto';
import { UpdateAiPromptTemplateDto } from './dto/update-ai-prompt-template.dto';
import { QueryAiPromptTemplateDto } from './dto/query-ai-prompt-template.dto';

@Injectable()
export class AiPromptTemplateService {
  private readonly logger = new Logger(AiPromptTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 校验 variables JSON 格式
   */
  private validateVariables(v?: string) {
    if (!v) return;
    try {
      const parsed = JSON.parse(v);
      if (!Array.isArray(parsed)) {
        throw new Error('variables 必须是 JSON 数组');
      }
    } catch (e) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        `variables JSON 格式错误:${(e as Error).message}`,
      );
    }
  }

  async list(query: QueryAiPromptTemplateDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AiPromptTemplateWhereInput = { deletedAt: null };
    if (query.code) where.code = { contains: query.code };
    if (query.name) where.name = { contains: query.name };
    if (query.status !== undefined) where.status = query.status;

    const orderBy: Prisma.AiPromptTemplateOrderByWithRelationInput = {
      [query.sortBy ?? 'id']: query.sortOrder ?? 'desc',
    } as Prisma.AiPromptTemplateOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.aiPromptTemplate.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiPromptTemplate.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async getById(id: number) {
    const row = await this.prisma.aiPromptTemplate.findUnique({ where: { id } });
    if (!row || row.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'Prompt 模板不存在');
    }
    return row;
  }

  async create(dto: CreateAiPromptTemplateDto) {
    this.validateVariables(dto.variables);
    try {
      return await this.prisma.aiPromptTemplate.create({
        data: {
          code: dto.code,
          name: dto.name,
          content: dto.content,
          variables: dto.variables ?? null,
          status: dto.status ?? 1,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(BizCode.USERNAME_EXISTS, 'Prompt 模板 code 已存在');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateAiPromptTemplateDto) {
    const exist = await this.prisma.aiPromptTemplate.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'Prompt 模板不存在');
    }
    this.validateVariables(dto.variables);
    try {
      return await this.prisma.aiPromptTemplate.update({
        where: { id },
        data: {
          code: dto.code ?? undefined,
          name: dto.name ?? undefined,
          content: dto.content ?? undefined,
          variables: dto.variables ?? undefined,
          status: dto.status ?? undefined,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BizException(BizCode.USERNAME_EXISTS, 'Prompt 模板 code 已存在');
      }
      throw e;
    }
  }

  async delete(id: number) {
    const exist = await this.prisma.aiPromptTemplate.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, 'Prompt 模板不存在');
    }
    await this.prisma.aiPromptTemplate.delete({ where: { id } });
    return { id };
  }
}
