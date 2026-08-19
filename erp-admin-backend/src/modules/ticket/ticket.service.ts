import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import dayjs = require('dayjs');
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-status.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';
import { RealtimeGateway } from '../ws/realtime.gateway';

/**
 * 工单状态机(Day 7)
 *
 * 状态码:
 * 1 待领取  2 处理中  3 已解决  4 已关闭
 *
 * 合法转换:
 * - 1→2(通过 assign 自动触发,updateStatus 不会触发)
 * - 2→3(处理中→已解决,设 resolvedAt = now)
 * - 3→4(已解决→已关闭,设 closedAt = now)
 * - 3→2(已解决→处理中,客户不满意重新打开,清 resolvedAt)
 * - 任意→4(管理员强制关闭,设 closedAt = now)
 *
 * 4→2 / 4→1 / 1→3 / 1→4 / 2→1 / 2→4 都不允许
 */
const STATE_TRANSITIONS: Record<string, ReadonlyArray<number>> = {
  '1': [2], // 待领取 → 处理中(只能由 assign 触发)
  '2': [3, 4], // 处理中 → 已解决 / 已关闭(强制)
  '3': [2, 4], // 已解决 → 处理中(重开) / 已关闭
  '4': [], // 已关闭 终态
};

const STATUS_LABELS: Record<number, string> = {
  1: '待领取',
  2: '处理中',
  3: '已解决',
  4: '已关闭',
};

const PRIORITY_LABELS: Record<number, string> = {
  1: '高',
  2: '中',
  3: '低',
};

// SLA 响应时限(h):priority 1 高 → 2h, 2 中 → 8h, 3 低 → 24h
const SLA_HOURS: Record<number, number> = { 1: 2, 2: 8, 3: 24 };

// 日志 action 取值
const LOG_ACTION = {
  CREATE: 'create',
  ASSIGN: 'assign',
  STATUS_CHANGE: 'status_change',
  REPLY: 'reply',
} as const;

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly dataScope: DataScopeService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ============================================================
  // GET /api/tickets — 列表(分页 + 多维筛选 + DataScope)
  // ============================================================
  async list(query: QueryTicketDto, currentUserId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CsTicketWhereInput = { deletedAt: null };

    // 业务筛选
    if (query.ticketNo) {
      where.ticketNo = { contains: query.ticketNo };
    }
    if (query.status !== undefined) where.status = query.status;
    if (query.priority !== undefined) where.priority = query.priority;
    if (query.assigneeId !== undefined) where.assigneeId = query.assigneeId;
    if (query.creatorId !== undefined) where.creatorId = query.creatorId;
    if (query.keyword) {
      // OR:title / content 含 keyword
      where.OR = [{ title: { contains: query.keyword } }, { content: { contains: query.keyword } }];
    }
    if (query.overdue === true) {
      // SLA 过期 = 未关闭(status 1/2/3)且 slaDeadline < now
      where.status = { in: [1, 2, 3] };
      where.slaDeadline = { lt: new Date() };
    }

    // DataScope
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applyTicketWhere(where, currentUserId, scope);

    const sortField = query.sortBy ?? 'id';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.CsTicketOrderByWithRelationInput = {
      [sortField]: sortOrder,
    } as Prisma.CsTicketOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.csTicket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
          assignee: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
        },
      }),
      this.prisma.csTicket.count({ where }),
    ]);

    return {
      list: list.map((t) => this.toSafeTicket(t)),
      total,
      page,
      pageSize,
    };
  }

  // ============================================================
  // GET /api/tickets/:id — 详情(含 logs)
  // ============================================================
  async getById(id: number, currentUserId: number) {
    const ticket = await this.prisma.csTicket.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, username: true, nickname: true, departmentId: true },
        },
        assignee: {
          select: { id: true, username: true, nickname: true, departmentId: true },
        },
        logs: {
          orderBy: { createdAt: 'asc' },
          include: {
            ticket: { select: { ticketNo: true } },
          },
        },
      },
    });
    if (!ticket || ticket.deletedAt) {
      throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
    }
    // DataScope 校验
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    if (scope.scope !== 1) {
      const inScope = await this.isInTicketScope(
        { assigneeId: ticket.assigneeId },
        currentUserId,
        scope,
      );
      if (!inScope) {
        throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
      }
    }
    return this.toSafeTicket(ticket, true);
  }

  // ============================================================
  // POST /api/tickets — 创建工单(自动 ticketNo + SLA deadline)
  // ============================================================
  async create(dto: CreateTicketDto, currentUserId: number) {
    const priority = dto.priority ?? 2;
    const slaHours = SLA_HOURS[priority] ?? 8;
    const slaDeadline = dayjs().add(slaHours, 'hour').toDate();

    // 工单号生成(P2002 重试 3 次)
    let ticket;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        ticket = await this.prisma.$transaction(async (tx) => {
          const ticketNo = await this.generateTicketNo(tx);
          const created = await tx.csTicket.create({
            data: {
              ticketNo,
              sessionId: dto.sessionId ?? null,
              title: dto.title,
              content: dto.content,
              priority,
              status: 1, // 默认待领取
              category: dto.category ?? null,
              creatorId: currentUserId,
              relatedOrderId: dto.relatedOrderId ?? null,
              slaDeadline,
              logs: {
                create: {
                  action: LOG_ACTION.CREATE,
                  toVal: '1',
                  comment: '创建工单',
                  operatorId: currentUserId,
                },
              },
            },
            include: {
              creator: {
                select: { id: true, username: true, nickname: true, departmentId: true },
              },
              assignee: {
                select: { id: true, username: true, nickname: true, departmentId: true },
              },
            },
          });
          return created;
        });
        break;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          this.logger.warn(`工单号冲突,重试 attempt=${attempt + 1}: ${(e as Error).message}`);
          if (attempt === 2) {
            throw new BizException(BizCode.SERVER_ERROR, '工单号生成失败(并发冲突),请重试');
          }
          continue;
        }
        throw e;
      }
    }

    void this.audit.create({
      userId: currentUserId,
      module: 'ticket',
      action: 'create',
      resource: 'ticket',
      resourceId: String(ticket!.id),
      method: 'POST',
      path: '/api/tickets',
      params: { title: dto.title, priority },
      newValue: {
        id: ticket!.id,
        ticketNo: ticket!.ticketNo,
        slaDeadline: ticket!.slaDeadline,
      },
      status: 1,
    });

    return this.toSafeTicket(ticket!);
  }

  // ============================================================
  // PUT /api/tickets/:id/assign — 分配工单
  //   改 status=2(处理中) + 写 log(action=assign)
  // ============================================================
  async assign(id: number, dto: AssignTicketDto, currentUserId: number) {
    const exist = await this.prisma.csTicket.findUnique({
      where: { id },
      include: { assignee: { select: { id: true, username: true, nickname: true } } },
    });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
    }

    // 校验 assignee 存在
    const target = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
      select: { id: true, username: true, nickname: true },
    });
    if (!target) {
      throw new BizException(BizCode.USER_NOT_FOUND, '被分配的用户不存在');
    }

    // 状态机:1(待领取)→2(处理中)才是正常 assign;已关闭(4)不能再 assign
    if (exist.status === 4) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '已关闭工单不可重新分配');
    }
    if (exist.status === 3) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        '已解决工单请先重新打开(状态变更 → 处理中)再分配',
      );
    }

    const fromStatus = exist.status;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.csTicket.update({
        where: { id },
        data: {
          assigneeId: dto.assigneeId,
          status: 2, // 处理中
        },
        include: {
          creator: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
          assignee: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
        },
      });
      // 写 log
      await tx.csTicketLog.create({
        data: {
          ticketId: id,
          action: LOG_ACTION.ASSIGN,
          fromVal: exist.assignee ? `${exist.assignee.id}:${exist.assignee.username}` : null,
          toVal: `${target.id}:${target.username}`,
          comment: `分配给 ${target.nickname ?? target.username}`,
          operatorId: currentUserId,
        },
      });
      // 如果原来是待领取,记一条 status_change
      if (fromStatus === 1) {
        await tx.csTicketLog.create({
          data: {
            ticketId: id,
            action: LOG_ACTION.STATUS_CHANGE,
            fromVal: '1',
            toVal: '2',
            comment: '待领取 → 处理中(分配触发)',
            operatorId: currentUserId,
          },
        });
      }
      return u;
    });

    void this.audit.create({
      userId: currentUserId,
      module: 'ticket',
      action: 'assign',
      resource: 'ticket',
      resourceId: String(id),
      method: 'PUT',
      path: `/api/tickets/${id}/assign`,
      params: { assigneeId: dto.assigneeId },
      oldValue: {
        assigneeId: exist.assigneeId,
        status: exist.status,
      },
      newValue: {
        assigneeId: dto.assigneeId,
        status: 2,
      },
      status: 1,
    });

    return this.toSafeTicket(updated);
  }

  // ============================================================
  // PUT /api/tickets/:id/status — 改状态(状态机约束)
  // ============================================================
  async updateStatus(id: number, dto: UpdateTicketStatusDto, currentUserId: number) {
    const exist = await this.prisma.csTicket.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
    }
    const from = exist.status;
    // cs-round-032:dto.newStatus → dto.status,DTO 字段已重命名
    const to = dto.status;
    if (from === to) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '工单已是该状态');
    }
    const allowed = STATE_TRANSITIONS[String(from)] ?? [];
    if (!allowed.includes(to)) {
      // cs-round-032 P1:错误 message 拼上合法转换列表,前端能直接看到可走的 next status
      const allowedLabels = allowed.length
        ? allowed.map((s) => STATUS_LABELS[s] ?? String(s)).join(' / ')
        : '(终态,无可转换目标)';
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        `状态不允许此操作:当前 ${STATUS_LABELS[from] ?? from},`
          + `合法转换 → ${allowedLabels};`
          + `你提交的目标 = ${STATUS_LABELS[to] ?? to}`,
      );
    }

    const now = new Date();
    const data: Prisma.CsTicketUpdateInput = { status: to };

    if (to === 3) {
      // 已解决
      data.resolvedAt = now;
      data.closedAt = null;
    } else if (to === 4) {
      // 已关闭
      data.closedAt = now;
    } else if (to === 2 && from === 3) {
      // 3→2 重开:清 resolvedAt / closedAt
      data.resolvedAt = null;
      data.closedAt = null;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.csTicket.update({
        where: { id },
        data,
        include: {
          creator: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
          assignee: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
        },
      });
      await tx.csTicketLog.create({
        data: {
          ticketId: id,
          action: LOG_ACTION.STATUS_CHANGE,
          fromVal: String(from),
          toVal: String(to),
          comment: dto.comment ?? `${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`,
          operatorId: currentUserId,
        },
      });
      return u;
    });

    // cs-round-036:status=4 (close) 时 WS emit ticket_closed,让 ai-cs + erp 前台实时切终止 UI
    if (to === 4 && updated.sessionId) {
      // cs-round-066:this.realtime.server 已是 namespace 实例,直接 .to().emit()(无 .of())
      this.realtime.server
        .to(`session:${updated.sessionId}`)
        .emit('ticket_closed', {
          ticketId: updated.id,
          ticketNo: updated.ticketNo,
          status: 4,
          closedAt: updated.closedAt?.toISOString() ?? new Date().toISOString(),
          closedBy: 'operator',
        });
    }

    void this.audit.create({
      userId: currentUserId,
      module: 'ticket',
      action: 'update-status',
      resource: 'ticket',
      resourceId: String(id),
      method: 'PUT',
      path: `/api/tickets/${id}/status`,
      params: { from, to, comment: dto.comment },
      oldValue: { status: from },
      newValue: { status: to },
      status: 1,
    });

    return this.toSafeTicket(updated);
  }

  // ============================================================
  // POST /api/tickets/:id/reply — 回复工单(只写 log,不改 status)
  // ============================================================
  async reply(id: number, dto: ReplyTicketDto, currentUserId: number) {
    const exist = await this.prisma.csTicket.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
    }
    if (exist.status === 4) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '已关闭工单不可回复');
    }

    // log 摘要 = content 前 50 字
    const summary = dto.content.length > 50 ? `${dto.content.slice(0, 50)}...` : dto.content;

    const log = await this.prisma.csTicketLog.create({
      data: {
        ticketId: id,
        action: LOG_ACTION.REPLY,
        fromVal: null,
        toVal: summary,
        comment: dto.content,
        operatorId: currentUserId,
      },
    });

    // Bridge to customer's chat thread:
    // if the ticket is anchored to a chat session, also surface the
    // operator reply as a message in cs_message so ai-cs-demo renders it.
    // cs-round-029:hoist `created` so the final return can expose messageId
    // to the ERP frontend for optimistic insert in use-conversation.send().
    let created: {
      id: number;
      content: string;
      status: number;
      metadata: any;
      createdAt: Date;
    } | null = null;
    if (exist.sessionId) {
      // Resolve operator display name (User.nickname preferred, else username).
      // Used by ai-cs-demo to label the operator bubble (e.g. "T-20260715003 · 王客服 处理中").
      const operator = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { nickname: true, username: true },
      });
      const operatorName =
        operator?.nickname?.trim() || operator?.username || `客服${currentUserId}`;

      created = await this.prisma.csMessage.create({
        data: {
          sessionId: exist.sessionId,
          role: 'assistant', // operator-reply bubbles in ai-cs-demo
          content: dto.content,
          status: 1, // 1 = normal (not streaming, not interrupted)
          metadata: {
            source: 'operator',
            operatorId: currentUserId,
            ticketNo: exist.ticketNo,
            operatorName,
          },
        },
      });

      // NEW: realtime push to ai-cs-demo subscribers of this session
      // cs-round-066:this.realtime.server 已是 namespace 实例,直接 .to().emit()(无 .of())
      this.realtime.server.to(`session:${exist.sessionId}`).emit('operator_reply', {
        sessionId: exist.sessionId,
        messageId: created.id,
        role: 'assistant',
        content: created.content,
        status: created.status,
        metadata: created.metadata,
        createdAt: created.createdAt.toISOString(),
        // Business identification for customer-facing bubble:
        // ticketNo for audit/二次回访, operatorName for "哪个客服在处理".
        ticketNo: exist.ticketNo,
        operatorName,
      });
    }

    void this.audit.create({
      userId: currentUserId,
      module: 'ticket',
      action: 'reply',
      resource: 'ticket',
      resourceId: String(id),
      method: 'POST',
      path: `/api/tickets/${id}/reply`,
      params: { logId: log.id, summary },
      status: 1,
    });

    return {
      ticketId: id,
      logId: log.id,
      createdAt: log.createdAt,
      // cs-round-029:把新建 cs_message 的 id 带回,前端 send() 拿到后可乐观插入
      messageId: created?.id ?? null,
    };
  }

  // ============================================================
  // GET /api/tickets/:id/logs — 流转日志(只读)
  // ============================================================
  async getLogs(id: number, currentUserId: number) {
    const exist = await this.prisma.csTicket.findUnique({
      where: { id },
      select: { id: true, deletedAt: true, assigneeId: true },
    });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
    }
    // DataScope 校验(只看到工单 → 才能看到 logs)
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    if (scope.scope !== 1) {
      const inScope = await this.isInTicketScope(
        { assigneeId: exist.assigneeId },
        currentUserId,
        scope,
      );
      if (!inScope) {
        throw new BizException(BizCode.TICKET_NOT_FOUND, '工单不存在');
      }
    }

    const logs = await this.prisma.csTicketLog.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'asc' },
    });
    return logs.map((l) => ({
      id: l.id,
      ticketId: l.ticketId,
      action: l.action,
      actionLabel: this.logActionLabel(l.action),
      fromVal: l.fromVal,
      toVal: l.toVal,
      comment: l.comment,
      operatorId: l.operatorId,
      createdAt: l.createdAt,
    }));
  }

  // ============================================================
  // GET /api/tickets/stats — 看板(简化)
  //   - pendingCount        待领取(status=1)
  //   - processingCount     处理中(status=2)
  //   - resolvedToday       今日已解决(status=3 & resolvedAt 今天)
  //   - overdueCount        SLA 过期(1/2/3 + slaDeadline < now)
  //   - avgResolveMinutes   近 100 条已解决工单的平均解决时长(分钟)
  // ============================================================
  async stats(currentUserId: number) {
    const whereBase: Prisma.CsTicketWhereInput = { deletedAt: null };
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applyTicketWhere(whereBase, currentUserId, scope);

    const startOfDay = dayjs().startOf('day').toDate();

    // overdue / pending / processing / resolvedToday 各自从 whereBase 继承 DataScope
    const pendingWhere: Prisma.CsTicketWhereInput = {
      ...whereBase,
      status: 1,
    };
    const processingWhere: Prisma.CsTicketWhereInput = {
      ...whereBase,
      status: 2,
    };
    const resolvedTodayWhere: Prisma.CsTicketWhereInput = {
      ...whereBase,
      status: 3,
      resolvedAt: { gte: startOfDay },
    };
    const overdueWhere: Prisma.CsTicketWhereInput = {
      ...whereBase,
      status: { in: [1, 2, 3] },
      slaDeadline: { lt: new Date() },
    };

    // avg resolve:取最近 100 条已解决工单的 createdAt / resolvedAt
    const avgWhere: Prisma.CsTicketWhereInput = {
      ...whereBase,
      status: 3,
      resolvedAt: { not: null },
    };

    const [pending, processing, resolvedToday, overdue, resolvedTickets] = await Promise.all([
      this.prisma.csTicket.count({ where: pendingWhere }),
      this.prisma.csTicket.count({ where: processingWhere }),
      this.prisma.csTicket.count({ where: resolvedTodayWhere }),
      this.prisma.csTicket.count({ where: overdueWhere }),
      this.prisma.csTicket.findMany({
        where: avgWhere,
        select: { createdAt: true, resolvedAt: true },
        orderBy: { resolvedAt: 'desc' },
        take: 100,
      }),
    ]);

    const avgResolveMinutes =
      resolvedTickets.length > 0
        ? Math.round(
            resolvedTickets.reduce(
              (sum, t) => sum + ((t.resolvedAt as Date).getTime() - t.createdAt.getTime()),
              0,
            ) /
              resolvedTickets.length /
              60000,
          )
        : 0;

    return {
      pendingCount: pending,
      processingCount: processing,
      resolvedToday,
      overdueCount: overdue,
      avgResolveMinutes,
    };
  }

  // ============================================================
  // 内部 helpers
  // ============================================================

  /**
   * 工单号生成:T-YYYYMMDDXXX(每日 001 起)
   * 用 count + 1 实现,并发冲突由 P2002 重试兜底
   */
  private async generateTicketNo(tx?: Prisma.TransactionClient): Promise<string> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;
    const today = dayjs().format('YYYYMMDD');
    // Day 9 修:用 MAX(后缀) + 1 而非 COUNT + 1
    // 避免并发(count 不可见对方未提交事务,两个事务都看到同一 count → 同一 ticketNo → P2002)
    const rows = await client.csTicket.findMany({
      where: { ticketNo: { startsWith: `T-${today}` } },
      select: { ticketNo: true },
    });
    let maxSeq = 0;
    for (const r of rows) {
      const m = r.ticketNo.match(/^T-\d{8}(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    return `T-${today}${String(maxSeq + 1).padStart(3, '0')}`;
  }

  /**
   * 工单实体 → 安全 DTO(扁平化 + label 化)
   */
  private toSafeTicket(
    t: {
      id: number;
      ticketNo: string;
      sessionId: number | null;
      title: string;
      content: string;
      priority: number;
      status: number;
      category: string | null;
      creatorId: number;
      assigneeId: number | null;
      relatedOrderId: number | null;
      slaDeadline: Date | null;
      resolvedAt: Date | null;
      closedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      deletedAt?: Date | null;
      creator?: {
        id: number;
        username: string;
        nickname: string | null;
        departmentId: number | null;
      } | null;
      assignee?: {
        id: number;
        username: string;
        nickname: string | null;
        departmentId: number | null;
      } | null;
      logs?: {
        id: number;
        ticketId: number;
        action: string;
        fromVal: string | null;
        toVal: string | null;
        comment: string | null;
        operatorId: number;
        createdAt: Date;
      }[];
    },
    withLogs = false,
  ) {
    const now = new Date();
    const slaOverdue = t.slaDeadline != null && t.slaDeadline < now && [1, 2, 3].includes(t.status);

    const base = {
      id: t.id,
      ticketNo: t.ticketNo,
      sessionId: t.sessionId,
      title: t.title,
      content: t.content,
      priority: t.priority,
      priorityLabel: PRIORITY_LABELS[t.priority] ?? String(t.priority),
      status: t.status,
      statusLabel: STATUS_LABELS[t.status] ?? String(t.status),
      category: t.category,
      creatorId: t.creatorId,
      assigneeId: t.assigneeId,
      relatedOrderId: t.relatedOrderId,
      slaDeadline: t.slaDeadline,
      slaOverdue,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      creator: t.creator
        ? {
            id: t.creator.id,
            username: t.creator.username,
            nickname: t.creator.nickname,
            departmentId: t.creator.departmentId,
          }
        : null,
      assignee: t.assignee
        ? {
            id: t.assignee.id,
            username: t.assignee.username,
            nickname: t.assignee.nickname,
            departmentId: t.assignee.departmentId,
          }
        : null,
    };
    if (withLogs && t.logs) {
      return {
        ...base,
        logs: t.logs.map((l) => ({
          id: l.id,
          ticketId: l.ticketId,
          action: l.action,
          actionLabel: this.logActionLabel(l.action),
          fromVal: l.fromVal,
          toVal: l.toVal,
          comment: l.comment,
          operatorId: l.operatorId,
          createdAt: l.createdAt,
        })),
      };
    }
    return base;
  }

  private logActionLabel(action: string): string {
    switch (action) {
      case 'create':
        return '创建';
      case 'assign':
        return '分配';
      case 'status_change':
        return '状态变更';
      case 'reply':
        return '回复';
      default:
        return action;
    }
  }

  /**
   * 校验单个 ticket 是否在当前用户 DataScope 内
   * 规则:同 order 一样,scope=1 全可见;其它看 assignee 所在部门 / assigneeId
   */
  private async isInTicketScope(
    ticket: { assigneeId: number | null },
    currentUserId: number,
    scope: { scope: number; deptId?: number; customDeptIds?: number[] },
  ): Promise<boolean> {
    if (scope.scope === 1) return true;
    if (scope.scope === 2) {
      if (ticket.assigneeId == null) return false; // 未分配工单对 scope=2 不可见
      if (scope.deptId == null) return ticket.assigneeId === currentUserId;
      const u = await this.prisma.user.findUnique({
        where: { id: ticket.assigneeId },
        select: { departmentId: true },
      });
      return u?.departmentId === scope.deptId;
    }
    if (scope.scope === 3) {
      return ticket.assigneeId === currentUserId;
    }
    if (scope.scope === 4) {
      if (ticket.assigneeId == null) return false;
      if (!scope.customDeptIds || scope.customDeptIds.length === 0) {
        return ticket.assigneeId === currentUserId;
      }
      const u = await this.prisma.user.findUnique({
        where: { id: ticket.assigneeId },
        select: { departmentId: true },
      });
      return u?.departmentId != null && scope.customDeptIds.includes(u.departmentId);
    }
    return false;
  }
}
