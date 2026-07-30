import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { decryptApiKey } from '../../common/utils/crypto.util';
import { FaqChromaService } from '../faq/faq-chroma.service';
import { EmbeddingService } from '../../common/services/embedding.service';
import { UpsertSessionDto } from './dto/upsert-session.dto';
import { AppendMessageDto } from './dto/append-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { CreateInternalTicketDto } from './dto/create-internal-ticket.dto';
import { CreateInternalEscalationDto } from './dto/create-internal-escalation.dto';
import { AppendMessageViaTicketDto } from './dto/append-message-via-ticket.dto';
import { TicketService } from '../ticket/ticket.service';
import { RealtimeGateway } from '../ws/realtime.gateway';

const SLA_HOURS: Record<number, number> = {
  1: 2, // 紧急 2h
  2: 8, // 中 8h
  3: 24, // 低 24h
};

/**
 * InternalService(Day 9 + Day 10 escalation)
 *
 * 7 个内部 API,供 ai-cs-demo 调:
 * 1. getActiveAiConfig     — 取默认 AI 配置(明文 key)
 * 2. searchFaq             — FAQ 语义检索
 * 3. upsertSession         — upsert 会话
 * 4. appendMessage         — 追加消息
 * 5. findOrderByNo         — 按 orderNo 查订单
 * 6. createTicket          — 创建工单(普通工单)
 * 7. createEscalation      — 转人工专用工单(category='escalation',默认高优)
 */
@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chroma: FaqChromaService,
    private readonly embedding: EmbeddingService,
    private readonly ticketService: TicketService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ============================================================
  // GET /api/internal/cs/ai-config/active
  //   返当前默认 AI 配置,**明文 apiKey** + baseUrl + 模型参数
  //   ai-cs-demo 拿到后存内存(避免每对话都拉)
  // ============================================================
  async getActiveAiConfig() {
    const row = await this.prisma.aiModelConfig.findFirst({
      where: { isDefault: true, status: 1, deletedAt: null },
    });
    if (!row) {
      throw new BizException(BizCode.BIZ_ERROR, '未配置默认 AI 模型');
    }
    let apiKey = '';
    if (row.apiKey) {
      try {
        apiKey = decryptApiKey(row.apiKey);
      } catch (e) {
        this.logger.error(`decrypt apiKey failed for config id=${row.id}: ${(e as Error).message}`);
        throw new BizException(BizCode.SERVER_ERROR, '默认 AI 配置 apiKey 解密失败');
      }
    }
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      provider: row.provider,
      modelId: row.modelId,
      apiKey, // 明文
      baseUrl: row.baseUrl,
      temperature: row.temperature,
      topP: row.topP,
      maxTokens: row.maxTokens,
      systemPrompt: row.systemPrompt,
    };
  }

  // ============================================================
  // GET /api/internal/cs/faq/search?q=...&topK=3
  //   走 EmbeddingService.embedQuery → Chroma 检索(只查 published)
  // ============================================================
  async searchFaq(q: string, topK: number) {
    const query = (q ?? '').trim();
    if (!query) {
      return { chunks: [], total: 0 };
    }
    const k = Math.min(Math.max(topK ?? 3, 1), 10);
    let emb: number[];
    try {
      const arr = await this.embedding.embed([query]);
      if (!arr || arr.length === 0) {
        return { chunks: [], total: 0 };
      }
      emb = arr[0];
    } catch (e) {
      this.logger.error(`embedQuery failed: ${(e as Error).message}`);
      throw new BizException(BizCode.SERVER_ERROR, `FAQ embedding 失败: ${(e as Error).message}`);
    }
    const hits = await this.chroma.search(emb, k);
    return {
      chunks: hits.map((h) => ({
        content: h.content,
        metadata: h.metadata ?? {},
        distance: h.distance,
      })),
      total: hits.length,
    };
  }

  // ============================================================
  // GET /api/internal/cs/sessions — 列出会话
  //   同时匹配 visitorId + userId(登录用户 userId 更新时仍能命中)
  //   用于 ai-cs-demo mount 时从服务端拉会话列表(防 localStorage 丢失)
  // ============================================================
  async listSessions({
    visitorId,
    userId,
    limit,
  }: {
    visitorId: string;
    userId?: number;
    limit: number;
  }) {
    const where = userId
      ? { OR: [{ userId }, { visitorId }], deletedAt: null }
      : { visitorId, deletedAt: null };
    const rows = await this.prisma.csSession.findMany({
      where,
      select: {
        sessionKey: true,
        visitorId: true,
        userId: true,
        messageCount: true,
        startedAt: true,
        updatedAt: true,
        visitorName: true, // 复用 visitorName 当 title
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      sessionKey: r.sessionKey,
      title: r.visitorName,
      visitorId: r.visitorId,
      userId: r.userId,
      messageCount: r.messageCount,
      updatedAt: r.updatedAt.toISOString(),
      startedAt: r.startedAt.toISOString(),
    }));
  }

  // ============================================================
  // POST /api/internal/cs/sessions — upsert 会话
  //   同 sessionKey 重复调 = messageCount 累加
  //   注意:这里 increment 是"调用次数",真实消息数 = cs_message 实际行数
  //   ai-cs-demo 可以借此感知"这是同一个会话的第几条"
  // ============================================================
  async upsertSession(dto: UpsertSessionDto) {
    const visitorName = dto.visitorName ?? `访客-${dto.visitorId.slice(0, 8)}`;
    const channel = dto.channel ?? 1;

    return this.prisma.csSession.upsert({
      where: { sessionKey: dto.sessionKey },
      update: {
        // 已有会话:只 +1 计数 + 更新 userId/customerId(登录态变更时同步)
        messageCount: { increment: 1 },
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
        ...(dto.customerId !== undefined ? { customerId: dto.customerId } : {}),
        ...(dto.title ? { visitorName: dto.title } : {}),
      },
      create: {
        sessionKey: dto.sessionKey,
        visitorId: dto.visitorId,
        visitorName,
        channel,
        aiModelCode: dto.aiModelCode ?? null,
        messageCount: 1,
        ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
        ...(dto.customerId !== undefined ? { customerId: dto.customerId } : {}),
        ...(dto.title ? { visitorName: dto.title } : {}),
      },
    });
  }

  // ============================================================
  // POST /api/internal/cs/sessions/:id/messages — 追加消息
  //   角色=user 时,emit 'user_message' WS 事件给 session room,
  //   让 erp-admin 运营在工单详情页(如有)实时看到客户新问题。
  // ============================================================
  async appendMessage(sessionId: number, dto: AppendMessageDto) {
    // 校验 session 存在(注意:软删中间件自动加 deletedAt: null)
    const session = await this.prisma.csSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }

    const created = await this.prisma.csMessage.create({
      data: {
        sessionId,
        role: dto.role,
        content: dto.content ?? '',
        parts: (dto.parts ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        status: dto.status ?? 1,
      },
    });

    // emit user_message to session room so operators see new customer msg live
    if (dto.role === 'user') {
      this.realtime.server.to(`session:${sessionId}`).emit('user_message', {
        sessionId,
        messageId: created.id,
        role: 'user',
        content: created.content,
        status: created.status,
        metadata: created.metadata,
        createdAt: created.createdAt.toISOString(),
      } as any);
    }

    return created;
  }

  // ============================================================
  // GET /api/internal/cs/sessions/:id/messages — 拉会话所有消息
  //   ai-cs-demo 刷新时调用,按 id ASC(创建顺序)
  //   返回完整字段(content + parts + metadata + status),前端可重渲染
  // ============================================================
  async getMessages(sessionId: number) {
    // 校验 session 存在
    const session = await this.prisma.csSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });
    if (!session) {
      throw new BizException(BizCode.BIZ_ERROR, '会话不存在');
    }

    const messages = await this.prisma.csMessage.findMany({
      where: { sessionId },
      orderBy: { id: 'asc' },
    });
    return { messages };
  }

  // ============================================================
  // PATCH /api/internal/cs/sessions/:id/messages/:msgId — 增量更新
  //   ai-cs-demo 流式期间每 500ms 调用一次,带最新 content + parts
  //   status: 2=streaming, 3=done
  //   校验 msg 存在 + 属于该 session(双重防御,防止跨 session 篡改)
  // ============================================================
  async updateMessage(sessionId: number, msgId: number, dto: UpdateMessageDto) {
    const msg = await this.prisma.csMessage.findFirst({
      where: { id: msgId, sessionId },
      select: { id: true },
    });
    if (!msg) {
      throw new BizException(BizCode.BIZ_ERROR, '消息不存在');
    }

    return this.prisma.csMessage.update({
      where: { id: msgId },
      data: {
        content: dto.content ?? undefined,
        parts: (dto.parts ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (dto.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        status: dto.status ?? undefined,
      },
    });
  }

  // ============================================================
  // GET /api/internal/cs/orders?sessionKey=X[&status=Y]
  //   W11 C-FULL:服务端从 sessionKey 反查 cs_session.userId,再查 Order。
  //   不接受 userId query 参数(防止 IDOR);即使客户端误传,也会被忽略并 warn。
  // ============================================================
  async listOrdersBySession(params: { sessionKey: string; status?: string }) {
    const { sessionKey, status } = params;
    if (!sessionKey || !sessionKey.trim()) {
      throw new BizException(BizCode.BAD_REQUEST, 'sessionKey 必传');
    }
    const sessionRow = await this.prisma.csSession.findUnique({
      where: { sessionKey: sessionKey.trim() },
      // W11:同时取 userId + customerId — C 端登录的 session 走 customerId 过滤
      select: { userId: true, customerId: true },
    });
    if (!sessionRow) {
      throw new BizException(BizCode.NOT_FOUND, `cs_session 不存在: ${sessionKey}`);
    }
    // 都没填 = 匿名访客(老 cs_session 数据,新代码不会产生),返空
    if (sessionRow.customerId === null && sessionRow.userId === null) {
      this.logger.log(`listOrdersBySession: ${sessionKey} 匿名 session,返空数组`);
      return [];
    }
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
    };
    // W11:C 端走 customer_id 过滤(和 user_id 命名空间隔离,不会撞 admin 之类的内部 user)
    if (sessionRow.customerId !== null) {
      where.customerId = sessionRow.customerId;
    } else if (sessionRow.userId !== null) {
      where.userId = sessionRow.userId;
    }
    if (status && status !== 'all') {
      const filter = this.mapCsStatusToOrder(status);
      if (filter) Object.assign(where, filter);
    }
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        user: { select: { id: true, username: true, nickname: true } },
        customer: { select: { id: true, email: true, nickname: true } },
      },
    });
    this.logger.log(
      `listOrdersBySession: ${sessionKey} customerId=${sessionRow.customerId} userId=${sessionRow.userId} 返 ${orders.length}`,
    );
    return orders;
  }

  private mapCsStatusToOrder(status: string): Prisma.OrderWhereInput | null {
    switch (status) {
      case 'paid':
        return { payStatus: 2 };
      case 'shipped':
        return { shipNo: { not: null } };
      case 'pending':
        return { orderStatus: 1 };
      case 'refunding':
        return { orderStatus: 5 };
      default:
        return null;
    }
  }

  // ============================================================
  // GET /api/internal/cs/orders/:orderNo
  // ============================================================
  async findOrderByNo(orderNo: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      include: {
        items: true,
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            phone: true,
            email: true,
          },
        },
      },
    });
    if (!order) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, `订单不存在: ${orderNo}`);
    }
    return order;
  }

  // ============================================================
  // POST /api/internal/cs/tickets — 创建工单(系统占位 creatorId=1)
  // 重试:并发可能撞 ticketNo unique,P2002 时 +1 再试
  // ============================================================
  async createTicket(dto: CreateInternalTicketDto) {
    const priority = dto.priority ?? 2;
    const slaHours = SLA_HOURS[priority] ?? 8;
    const slaDeadline = new Date(Date.now() + slaHours * 3600 * 1000);

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ticketNo = await this.generateTicketNo(attempt);
      try {
        return await this.prisma.csTicket.create({
          data: {
            ticketNo,
            title: dto.title,
            content: dto.content,
            priority,
            category: dto.category ?? null,
            sessionId: dto.sessionId ?? null,
            relatedOrderId: dto.relatedOrderId ?? null,
            slaDeadline,
            status: 1, // 待领取
            creatorId: 1, // 系统占位
            logs: {
              create: {
                action: 'create',
                operatorId: 1,
                comment: 'ai-cs-demo 自动创建',
                toVal: '1',
              },
            },
          },
          include: {
            creator: {
              select: { id: true, username: true, nickname: true },
            },
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(`ticketNo 冲突,重试 attempt=${attempt + 1}: ${(e as Error).message}`);
          continue;
        }
        throw e;
      }
    }
    throw new BizException(BizCode.SERVER_ERROR, '工单号生成失败(重试 5 次)');
  }

  // ============================================================
  // POST /api/internal/cs/escalations — 转人工专用(系统占位 creatorId=1)
  //   与 createTicket 共用 cs_ticket 表,通过 category='escalation' 区分,
  //   默认 priority=1(紧急,2h SLA),便于运营按 category 筛选。
  //   不发 ticket.created 事件(W11 backend 当前无事件总线,后续接 SSE/WebSocket 时再加)。
  // ============================================================
  async createEscalation(dto: CreateInternalEscalationDto) {
    const priority = dto.priority ?? 1; // 转人工默认高优
    const slaHours = SLA_HOURS[priority] ?? 2;
    const slaDeadline = new Date(Date.now() + slaHours * 3600 * 1000);

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ticketNo = await this.generateTicketNo(attempt);
      try {
        // Resolve sessionKey (string, from ai-cs-demo MCP tool) →
        // cs_session.id (int FK) so cs_ticket.sessionId links the row
        // to the original chat session. This is what enables
        // ticket.service.ts reply() bridge to write cs_message when
        // an operator replies in erp-admin (the bridge skips when
        // sessionId is null).
        let sessionRow: { id: number } | null = null;
        if (dto.sessionKey) {
          sessionRow = await this.prisma.csSession.findUnique({
            where: { sessionKey: dto.sessionKey },
            select: { id: true },
          });
          if (!sessionRow) {
            this.logger.warn(
              `escalation sessionKey=${dto.sessionKey} 未命中 cs_session,将以 sessionId=null 创建工单`,
            );
          }
        }

        // Dedup:W9-10 Day 9 — 同一个 chat session 重复点"转人工"会反复
        // 走到这里创建新工单,运营后台看到一串同 session 的重复 ticket。
        // 这里在 session 已挂上未结束工单时,直接复用既有 ticketNo,
        // 不再 prisma.csTicket.create。CsTicket.status:
        //   1=待领取 / 2=处理中 / 3=已解决 / 4=已关闭
        // 1-3 都算"还在服务中",4 已结束允许新开。
        if (sessionRow) {
          const open = await this.prisma.csTicket.findFirst({
            where: {
              sessionId: sessionRow.id,
              status: { in: [1, 2, 3] },
              deletedAt: null,
            },
            orderBy: { id: 'desc' },
            select: {
              id: true,
              ticketNo: true,
              slaDeadline: true,
              category: true,
            },
          });
          if (open) {
            this.logger.log(
              `escalation dedup hit: sessionId=${sessionRow.id} 已存在 ticketNo=${open.ticketNo}`,
            );
            return {
              code: open.ticketNo,
              ticketNo: open.ticketNo,
              ticketId: open.id,
              priority,
              slaDeadline: open.slaDeadline,
              category: open.category ?? 'escalation',
            };
          }
        }

        const ticket = await this.prisma.csTicket.create({
          data: {
            ticketNo,
            title: dto.subject,
            content: dto.content,
            priority,
            category: 'escalation', // 与普通工单区分
            slaDeadline,
            status: 1, // 待领取
            creatorId: 1, // 系统占位
            sessionId: sessionRow?.id ?? null,
            logs: {
              create: {
                action: 'create',
                operatorId: 1,
                comment: `ai-cs-demo 转人工 (sessionKey=${dto.sessionKey ?? 'n/a'}, userId=${dto.userId ?? 'n/a'})`,
                toVal: '1',
              },
            },
          },
          include: {
            creator: {
              select: { id: true, username: true, nickname: true },
            },
          },
        });
        this.logger.log(
          `escalation created: ticketNo=${ticket.ticketNo} id=${ticket.id} priority=${priority} sessionKey=${dto.sessionKey ?? 'n/a'}`,
        );
        // 返 code + ticketNo + ticketDbId(id) 三段,与 create_ticket MCP 工具预期一致
        return {
          code: ticket.ticketNo,
          ticketNo: ticket.ticketNo,
          id: ticket.id,
          ticketId: ticket.id,
          priority,
          slaDeadline: ticket.slaDeadline,
          category: 'escalation',
        };
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < maxAttempts - 1
        ) {
          this.logger.warn(
            `escalation ticketNo 冲突,重试 attempt=${attempt + 1}: ${(e as Error).message}`,
          );
          continue;
        }
        throw e;
      }
    }
    throw new BizException(BizCode.SERVER_ERROR, '转人工工单号生成失败(重试 5 次)');
  }

  // ============================================================
  // GET /api/internal/cs/sessions/:id/session-info — 取会话关键字段
  //   业务:让 erp-admin ConversationPanel 能拿到 cs_session.sessionKey,
  //   用于 socket.io /realtime auth.auth.sessionKey(共享 thread 最后一环)。
  //   极小只读,select 限定字段避免泄漏。
  // ============================================================
  async getSessionInfo(sessionId: number) {
    const row = await this.prisma.csSession.findUnique({
      where: { id: sessionId },
      select: { id: true, sessionKey: true, visitorId: true, visitorName: true },
    });
    if (!row) throw new NotFoundException('session not found');
    return {
      sessionId: row.id,
      sessionKey: row.sessionKey,
      visitorId: row.visitorId,
      visitorName: row.visitorName ?? null,
    };
  }

  // ============================================================
  // GET /api/internal/cs/sessions/:id/open-ticket — 取会话当前 OPEN 工单
  //   业务:ai-cs-demo 检测"已转人工"(open ticket 存在),AI 闭嘴不再调 LLM。
  //   status ∈ {1,2,3} 都算 open,4 已结束允许新开。
  // ============================================================
  async getSessionOpenTicket(sessionId: number) {
    const t = await this.prisma.csTicket.findFirst({
      where: {
        sessionId,
        status: { in: [1, 2, 3] },
        deletedAt: null,
      },
      orderBy: { id: 'desc' },
      select: { id: true, ticketNo: true, status: true, priority: true },
    });
    return t
      ? { ticketNo: t.ticketNo, status: t.status, ticketId: t.id, priority: t.priority }
      : null;
  }

  // ============================================================
  // POST /api/internal/cs/tickets/:id/messages — 运营通过 ticket 路由发消息
  //   内部走 ticket.service.reply():自动建 cs_ticket_log + cs_message bridge + operator_reply WS emit。
  //   creatorId=1(系统占位)保持与内部其它路径一致;
  //   reply() 内部会用 currentUserId 解析 operatorName。
  // ============================================================
  async appendOperatorMessageViaTicket(ticketId: number, dto: AppendMessageViaTicketDto) {
    const ticket = await this.prisma.csTicket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException('ticket not found');
    }

    return await this.ticketService.reply(
      ticketId,
      { content: dto.content, internal: dto.internal } as any,
      1, // 系统占位 creatorId(同 createEscalation / createTicket)
    );
  }

  // ============================================================
  // DELETE /api/internal/cs/sessions/:id — 软删会话
  //   csSession.deletedAt = now()
  //   P2025(record not found) → 抛 NotFoundException
  // ============================================================
  async deleteSession(id: number) {
    try {
      return await this.prisma.csSession.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException('会话不存在或已删除');
      }
      throw e;
    }
  }

  // ============================================================
  // private
  // 修法(Day 9):用 MAX(ticketNo 后缀) + 1,而非 COUNT + 1
  //   原 count+1 方案在并发下两个事务都看到 count=34,都创 T-20260624035 → P2002
  //   改用 max(后缀数字) 后再 + offset,并发时第一个事务 max=34,第二个 max=35
  // ============================================================
  private async generateTicketNo(offset = 0): Promise<string> {
    const today = new Date();
    const ymd =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
    const prefix = `T-${ymd}`;
    // 取今日所有 ticketNo 的最大序号
    const rows = await this.prisma.csTicket.findMany({
      where: { ticketNo: { startsWith: prefix } },
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
    return `${prefix}${String(maxSeq + 1 + offset).padStart(3, '0')}`;
  }
}
