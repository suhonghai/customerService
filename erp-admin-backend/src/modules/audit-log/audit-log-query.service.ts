import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

/**
 * AuditLog 查询 Service(Day 4 扩展)
 *
 * - list: 列表,不带 params / oldValue / newValue(防泄漏 + 性能)
 * - getById: 详情,含完整 oldValue / newValue(超级管理员可看)
 */
@Injectable()
export class AuditLogQueryService {
  private readonly logger = new Logger(AuditLogQueryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryAuditLogDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AuditLogWhereInput = {};
    if (query.userId !== undefined) where.userId = query.userId;
    if (query.username) where.username = { contains: query.username };
    if (query.module) where.module = query.module;
    if (query.action) where.action = query.action;
    if (query.status !== undefined) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        const d = new Date(query.startDate);
        if (!isNaN(d.getTime())) (where.createdAt as Prisma.DateTimeFilter).gte = d;
      }
      if (query.endDate) {
        const d = new Date(query.endDate);
        if (!isNaN(d.getTime())) (where.createdAt as Prisma.DateTimeFilter).lte = d;
      }
    }

    const orderBy: Prisma.AuditLogOrderByWithRelationInput = {
      [query.sortBy ?? 'id']: query.sortOrder ?? 'desc',
    } as Prisma.AuditLogOrderByWithRelationInput;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        // 列表不返 params / oldValue / newValue(详情接口再返)
        select: {
          id: true,
          userId: true,
          username: true,
          module: true,
          action: true,
          resource: true,
          resourceId: true,
          method: true,
          path: true,
          ip: true,
          userAgent: true,
          status: true,
          errorMsg: true,
          costMs: true,
          createdAt: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { list: rows, total, page, pageSize };
  }

  async getById(id: number) {
    const row = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!row) {
      throw new BizException(BizCode.BIZ_ERROR, '审计日志不存在');
    }
    return row;
  }
}
