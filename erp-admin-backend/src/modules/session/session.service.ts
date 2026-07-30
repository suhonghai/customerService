import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { QuerySessionDto } from './dto/query-session.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';

/**
 * SessionService(Day 8)
 *
 * 接口:
 * - GET    /api/sessions                  列表(分页 + 多维筛选 + DataScope)
 * - GET    /api/sessions/:id              详情(含 messageCount + 最近一条预览)
 * - GET    /api/sessions/:id/messages     消息分页
 * - DELETE /api/sessions/:id              软删(GDPR)
 *
 * CsSession 已加入软删除中间件,所有 read 自动过滤 deletedAt=null
 *   - 详情/findUnique:软删中间件已加 deletedAt: null,删了自动 0 行
 *   - 删除:Prisma.delete → 中间件转 update deletedAt = NOW()
 */

const STATUS_LABELS: Record<number, string> = {
  1: '进行中',
  2: '已结束',
};

const CHANNEL_LABELS: Record<number, string> = {
  1: 'Web',
  2: '微信',
  3: 'App',
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly dataScope: DataScopeService,
  ) {}

  // ============================================================
  // GET /api/sessions — 列表(分页 + 多维筛选 + DataScope)
  // ============================================================
  async list(query: QuerySessionDto, currentUserId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CsSessionWhereInput = {}; // 软删中间件已加 deletedAt: null

    // 业务筛选
    if (query.visitorId) where.visitorId = query.visitorId;
    if (query.userId !== undefined) where.userId = query.userId;
    if (query.status !== undefined) where.status = query.status;
    if (query.hasRating === true) where.rating = { not: null };
    if (query.hasRating === false) where.rating = null;

    if (query.startDate || query.endDate) {
      where.startedAt = {};
      if (query.startDate) {
        const d = new Date(query.startDate);
        if (!Number.isNaN(d.getTime())) where.startedAt.gte = d;
      }
      if (query.endDate) {
        const d = new Date(query.endDate);
        if (!Number.isNaN(d.getTime())) where.startedAt.lte = d;
      }
    }

    // DataScope(scope 1 不加;scope 2/3/4 加 user/userId 过滤)
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applySessionWhere(where, currentUserId, scope);

    const sortField = query.sortBy ?? 'id';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.CsSessionOrderByWithRelationInput = {
      [sortField]: sortOrder,
    } as Prisma.CsSessionOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.csSession.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
        },
      }),
      this.prisma.csSession.count({ where }),
    ]);

    return {
      list: list.map((s) => this.toSafeSession(s, /*withDetail*/ false)),
      total,
      page,
      pageSize,
    };
  }

  // ============================================================
  // GET /api/sessions/:id — 详情(含 messageCount + 最近一条预览)
  // ============================================================
  async findOne(id: number, currentUserId: number) {
    const session = await this.prisma.csSession.findFirst({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, nickname: true, departmentId: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, content: true, role: true, createdAt: true },
        },
        _count: {
          select: { messages: true },
        },
      },
    });
    if (!session) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }
    // DataScope 校验
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    const inScope = await this.isInSessionScope(session, currentUserId, scope);
    if (!inScope) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }
    return this.toSafeSession(session, /*withDetail*/ true);
  }

  // ============================================================
  // GET /api/sessions/:id/messages — 消息分页
  // ============================================================
  async findMessages(
    id: number,
    query: QueryMessagesDto,
    currentUserId: number,
  ) {
    // 1. 先校验 session 存在 + DataScope
    const session = await this.prisma.csSession.findFirst({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!session) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    const inScope = await this.isInSessionScope(
      { userId: session.userId },
      currentUserId,
      scope,
    );
    if (!inScope) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const sortOrder = query.sortOrder ?? 'desc';

    const [list, total] = await this.prisma.$transaction([
      this.prisma.csMessage.findMany({
        where: { sessionId: id },
        orderBy: { createdAt: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sessionId: true,
          role: true,
          content: true,
          userId: true,
          createdAt: true,
        },
      }),
      this.prisma.csMessage.count({ where: { sessionId: id } }),
    ]);

    return { list, total, page, pageSize };
  }

  // ============================================================
  // DELETE /api/sessions/:id — 软删 + 消息匿名化(GDPR)
  //   Day 9 修:Bug #2 — 之前用 prisma.csSession.delete 触发中间件转 update deletedAt,
  //   但关联 CsMessage.onDelete=Cascade 会物理删消息,违反 GDPR"删除即擦除"原则
  //   修法:不走 delete 路径(避免级联),显式事务里
  //     - update cs_session set deleted_at = NOW()
  //     - update cs_message set content = '[已删除]', parts = NULL
  //     - metadata 保留(只擦 PII 内容)
  // ============================================================
  async remove(id: number, currentUserId: number) {
    const exist = await this.prisma.csSession.findFirst({
      where: { id },
      select: { id: true, visitorId: true, visitorName: true, userId: true },
    });
    if (!exist) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }
    // DataScope 校验(超管 / 本部门 / 本人 才允许删)
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    const inScope = await this.isInSessionScope(
      { userId: exist.userId },
      currentUserId,
      scope,
    );
    if (!inScope) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }

    // 显式事务:软删 session + 消息匿名化(不走 delete 路径,避免 Cascade 物理删)
    await this.prisma.$transaction([
      this.prisma.csSession.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.csMessage.updateMany({
        where: { sessionId: id },
        data: { content: '[已删除]', parts: Prisma.JsonNull },
      }),
    ]);

    void this.audit.create({
      userId: currentUserId,
      module: 'session',
      action: 'delete',
      resource: 'cs_session',
      resourceId: String(id),
      method: 'DELETE',
      path: `/api/sessions/${id}`,
      params: { visitorId: exist.visitorId, visitorName: exist.visitorName },
      status: 1,
    });

    return { id, deleted: true, anonymizedMessages: true };
  }

  // ============================================================
  // 内部 helpers
  // ============================================================

  /**
   * 会话实体 → 安全 DTO
   * @param s Prisma 返回的会话实体(可能带 user / messages / _count)
   * @param withDetail 详情模式:带 messageCount / preview / previewAt
   */
  private toSafeSession(
    s: {
      id: number;
      sessionKey: string;
      userId: number | null;
      visitorId: string;
      visitorName: string | null;
      channel: number;
      status: number;
      aiModelCode: string | null;
      messageCount: number;
      rating: number | null;
      ratingText: string | null;
      escalatedAt: Date | null;
      endedAt: Date | null;
      startedAt: Date;
      updatedAt: Date;
      user?: {
        id: number;
        username: string;
        nickname: string | null;
        departmentId: number | null;
      } | null;
      messages?: {
        id: number;
        content: string;
        role: string;
        createdAt: Date;
      }[];
      _count?: { messages: number };
    },
    withDetail: boolean,
  ) {
    const base = {
      id: s.id,
      sessionKey: s.sessionKey,
      userId: s.userId,
      visitorId: s.visitorId,
      visitorName: s.visitorName,
      channel: s.channel,
      channelLabel: CHANNEL_LABELS[s.channel] ?? String(s.channel),
      status: s.status,
      statusLabel: STATUS_LABELS[s.status] ?? String(s.status),
      aiModelCode: s.aiModelCode,
      messageCount: s.messageCount,
      rating: s.rating,
      ratingText: s.ratingText,
      escalatedAt: s.escalatedAt,
      endedAt: s.endedAt,
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      user: s.user
        ? {
            id: s.user.id,
            username: s.user.username,
            nickname: s.user.nickname,
            departmentId: s.user.departmentId,
          }
        : null,
    };
    if (!withDetail) return base;
    // 详情模式:加 messageCount(实查)+ preview / previewAt
    const count = s._count?.messages ?? s.messageCount ?? 0;
    const last = s.messages && s.messages.length > 0 ? s.messages[0] : null;
    const preview =
      last && last.content
        ? last.content.length > 50
          ? `${last.content.slice(0, 50)}...`
          : last.content
        : null;
    return {
      ...base,
      messageCount: count,
      preview,
      previewAt: last?.createdAt ?? null,
    };
  }

  /**
   * 校验单个 session 是否在当前用户 DataScope 内
   */
  private async isInSessionScope(
    session: { userId: number | null },
    currentUserId: number,
    scope: { scope: number; deptId?: number; customDeptIds?: number[] },
  ): Promise<boolean> {
    if (scope.scope === 1) return true;
    if (scope.scope === 2) {
      if (session.userId == null) return false; // 未分配对 scope=2 不可见
      if (scope.deptId == null) return session.userId === currentUserId;
      const u = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { departmentId: true },
      });
      return u?.departmentId === scope.deptId;
    }
    if (scope.scope === 3) {
      return session.userId === currentUserId;
    }
    if (scope.scope === 4) {
      if (session.userId == null) return false;
      if (!scope.customDeptIds || scope.customDeptIds.length === 0) {
        return session.userId === currentUserId;
      }
      const u = await this.prisma.user.findUnique({
        where: { id: session.userId },
        select: { departmentId: true },
      });
      return (
        u?.departmentId != null && scope.customDeptIds.includes(u.departmentId)
      );
    }
    return false;
  }
}
