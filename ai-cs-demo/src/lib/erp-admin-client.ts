/**
 * ErpAdminClient — ai-cs-demo 调 erp-admin internal API 的 HTTP 客户端(Day 9)
 *
 * 配置(.env.{development|test|uat|production} → 走 src/lib/env.ts):
 *   ERP_ADMIN_URL=http://127.0.0.1:3001
 *   ERP_ADMIN_TOKEN=<与 erp-admin 的 INTERNAL_TOKEN 一致>
 *
 * 设计:
 * - 全部方法返裸 data(由 ErpAdminResponse 解包),调用方拿到的就是业务对象
 * - 失败抛 Error,message 是后端 message(code !== 0)
 * - 不要写超时(默认 fetch 即可);生产可加 AbortSignal
 * - env 读取走 src/lib/env.ts(2026-07-13 多环境改造),不再直接 process.env
 */

import { env, getErpAdminToken } from './env';

export interface ActiveAiConfig {
  id: number;
  code: string;
  name: string;
  provider: string;
  modelId: string;
  apiKey: string; // 明文
  baseUrl: string | null;
  temperature: number;
  topP: number;
  maxTokens: number;
  systemPrompt: string | null;
}

export interface FaqChunk {
  content: string;
  metadata: Record<string, unknown>;
  distance: number | null;
}

export interface SessionInfo {
  id: number;
  sessionKey: string;
  visitorId: string;
  visitorName: string | null;
  channel: number;
  status: number;
  aiModelCode: string | null;
  messageCount: number;
  startedAt: string;
  updatedAt: string;
}

export interface OrderInfo {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  totalAmount: string;
  payAmount: string;
  payStatus: number;
  orderStatus: number;
  address: string | null;
  items: Array<{
    id: number;
    productId: string;
    productName: string;
    productSku: string | null;
    price: string;
    quantity: number;
    subtotal: string;
  }>;
}

export interface TicketInfo {
  id: number;
  ticketNo: string;
  status: number;
  priority: number;
  title: string;
  content: string;
  slaDeadline: string;
  creatorId: number;
}

/**
 * 服务端持久化的消息行(csMessage),GET messages 返回的元素。
 * status:1=normal(流已结束) / 2=streaming(流式中) / 3=interrupted(中断)
 */
export interface StoredMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts: unknown;
  metadata: unknown;
  status: number;
  createdAt: string;
  updatedAt: string;
}

interface ErpAdminResponse<T> {
  code: number;
  message: string;
  data: T;
}

export class ErpAdminClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = env.ERP_ADMIN_URL;
    // W11 容器化兼容:docker-compose.yml 用 ERP_ADMIN_INTERNAL_TOKEN,
    // 本地 .env.development 用 ERP_ADMIN_TOKEN —— 都接受(env.ts 的 getErpAdminToken 统一处理)
    this.token = getErpAdminToken();
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.token) {
      throw new Error('ERP_ADMIN_TOKEN 未配置(.env.local)');
    }
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.token,
          ...(init?.headers || {}),
        },
      });
    } catch (e) {
      throw new Error(`erp-admin 请求失败(${url}): ${(e as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as ErpAdminResponse<T>;
    if (!json || typeof json !== 'object' || json.code === undefined) {
      throw new Error(`erp-admin 响应非 JSON: status=${res.status}`);
    }
    if (json.code !== 0) {
      throw new Error(`erp-admin 业务错误 code=${json.code}: ${json.message}`);
    }
    return json.data;
  }

  async getActiveAiConfig(): Promise<ActiveAiConfig> {
    return this.request<ActiveAiConfig>('/api/internal/cs/ai-config/active');
  }

  async searchFaq(query: string, topK = 3): Promise<{ chunks: FaqChunk[]; total: number }> {
    const q = encodeURIComponent(query);
    return this.request<{ chunks: FaqChunk[]; total: number }>(
      `/api/internal/cs/faq/search?q=${q}&topK=${topK}`,
    );
  }

  async upsertSession(payload: {
    sessionKey: string;
    visitorId: string;
    visitorName?: string;
    /** V1 S7:首问派生后的 title,后端 internal.service 会覆盖 visitorName */
    title?: string;
    channel?: number;
    aiModelCode?: string;
    /**
     * V1 S5:已登录用户的 userId;后端 upsert 落到 cs_session.userId。
     * 对内部员工 userId 是 User.id,对 C 端是 CsCustomer.id(命名空间不同,
     * 后端 upsertSession 收到时**不**自动分流,需要配合 customerId 字段)。
     */
    userId?: number | null;
    /**
     * W11:C 端 CsCustomer.id(和 userId 互斥)。C 端登录时同时塞这个,后端 upsert 写到
     * cs_session.customerId;listOrdersBySession 看到 customerId 非空就走 Order.customer_id
     * 过滤,避开 CsCustomer.id 撞 User.id 命名空间的 bug。
     */
    customerId?: number | null;
  }): Promise<SessionInfo> {
    return this.request<SessionInfo>('/api/internal/cs/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async appendMessage(
    sessionId: number,
    message: {
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      parts?: unknown;
      metadata?: unknown;
      status?: number;
    },
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>(`/api/internal/cs/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    });
  }

  /**
   * 拉会话所有消息(刷新恢复用),按 id ASC。
   */
  async getSessionMessages(sessionId: number): Promise<StoredMessage[]> {
    const data = await this.request<{ messages: StoredMessage[] }>(
      `/api/internal/cs/sessions/${sessionId}/messages`,
      { method: 'GET' },
    );
    return data.messages;
  }

  /**
   * 增量更新一条消息(流式期间节流调用)。
   * status:1=normal / 2=streaming / 3=interrupted
   */
  async updateMessage(
    sessionId: number,
    msgId: number,
    data: {
      content?: string;
      parts?: unknown;
      metadata?: unknown;
      status?: number;
    },
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>(
      `/api/internal/cs/sessions/${sessionId}/messages/${msgId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  }

  /**
   * cs-round-011:拉单条消息(续推接口需要)。
   * 用于客户端刷新后 / 点重试时,服务端拿到已有 partial content + parts 后
   * 把续推的 LLM 输出 append 到这条 message 上(而不是开新 placeholder)。
   * 404 / 不存在 → 服务端 4xx 拒绝 continueFromMessageId。
   */
  async getMessage(sessionId: number, msgId: number): Promise<StoredMessage> {
    return this.request<StoredMessage>(
      `/api/internal/cs/sessions/${sessionId}/messages/${msgId}`,
      { method: 'GET' },
    );
  }

  async findOrderByNo(orderNo: string): Promise<OrderInfo> {
    return this.request<OrderInfo>(`/api/internal/cs/orders/${encodeURIComponent(orderNo)}`);
  }

  /**
   * W11 C3 (shared thread):取会话当前 OPEN 工单(status ∈ {1,2,3})。
   *  ai-cs-demo chat 路由在调 LLM 前用这个探测"是否已转人工",
   *  若是 → AI 闭嘴,只把 user 消息 append 到 cs_message(backend emit user_message WS),
   *  然后合成一条 "运营正在处理您的消息,请稍候。" 给前端渲染。
   *  无 open ticket → 返 null。
   */
  async getSessionOpenTicket(
    sessionId: number,
  ): Promise<{ ticketNo: string; status: number; ticketId: number; priority: number } | null> {
    // cs-round-038:浏览器端 this.baseUrl 是 env.ERP_ADMIN_URL(undefined → fallback
    //   http://127.0.0.1:3001),拼 path 后变成跨域请求 backend 404 → fetch 失败。
    //   直接走相对路径调 Next.js BFF,浏览器 fetch 当前 origin 无 CORS。
    //   credentials:'include' 自动带 cs_access_token cookie(虽然此 endpoint 不需要,但保持一致)
    const res = await fetch(`/api/cs/sessions/${sessionId}/open-ticket`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      // 后端 /api/cs/sessions/[id]/open-ticket 返 200 时 status 是 fetch 原状态
      // Next.js BFF 已经包装 {code,data,message} 结构,code !== 0 也算业务错
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      data?: { ticketNo: string; status: number; ticketId: number; priority: number } | null;
    };
    return json.data ?? null;
  }

  /**
   * cs-round-031:该会话是否已有运营(operator)回复过。
   *  chat 路由在 handoff ack 前用这个判断:客服已接手(有 metadata.source='operator'
   *  的 cs_message)→ 后续 user 消息不再合成 "运营正在处理…" ack(避免每条都弹"请稍候")。
   *  无 operator 回复(首次转人工)→ 仍走原 ack 路径。
   */
  async hasOperatorReply(sessionId: number): Promise<boolean> {
    const messages = await this.getSessionMessages(sessionId);
    return messages.some(
      (m) => (m.metadata as { source?: string } | null | undefined)?.source === 'operator',
    );
  }

  /**
   * W11 删会话:按 sessionKey(而非 backend id)删除。
   *
   * 后端 DELETE /api/internal/cs/sessions/:id 只接受 backend 主键 id;
   * ai-cs-demo 只知道 sessionKey,所以先 upsert 拿到 id(幂等,update 分支只
   * +1 messageCount + 同步 userId,**不会污染 visitorName**)再 DELETE。
   *
   * visitorId 仅用于 upsert 的 create 分支占位(实际命中 update 分支,
   * visitorId / visitorName 都不会被改写);传当前浏览器的 getVisitorId()
   * 即可,后端即使落到 create 分支也只是一个匿名会话,反正是要删的。
   */
  async deleteSessionBySessionKey(sessionKey: string, visitorId: string): Promise<void> {
    const session = await this.upsertSession({ sessionKey, visitorId });
    const url = `${this.baseUrl}/api/internal/cs/sessions/${session.id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-Internal-Token': this.token },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`deleteSession failed: status=${res.status} body=${text}`);
    }
  }

  async createTicket(payload: {
    title: string;
    content: string;
    priority?: number;
    category?: string;
    sessionId?: number;
    relatedOrderId?: number;
  }): Promise<TicketInfo> {
    return this.request<TicketInfo>('/api/internal/cs/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * cs-round-036:用户主动"结束对话"关单
   *   内部 POST 到 `/api/internal/cs/sessions/:sessionKey/close-ticket`
   *   后端做 sessionKey 归属校验,只关该 session 的 OPEN 工单,绝不接受 ticketId
   *   (防 INTERNAL_TOKEN 滥用关别人工单)
   *   后端 WS emit ticket_closed 给 session room,ai-cs 端订阅后切终止 UI
   */
  async closeTicketBySession(
    sessionKey: string,
    reason?: string,
  ): Promise<{
    ticketId: number;
    ticketNo: string;
    status: 4;
    closedAt: string;
    closedBy: 'user';
  }> {
    // cs-round-039:同 cs-round-038 getSessionOpenTicket bug —
    //   this.request 在浏览器端 token undefined → "ERP_ADMIN_TOKEN 未配置"。
    //   改走浏览器相对路径 fetch Next.js BFF route /api/cs/sessions/.../close-ticket,
    //   server-side 转 backend + X-Internal-Token(避免 CORS + 复用现有 BFF)。
    //   credentials:'include' 带 cookie(此 endpoint 实际不强制需要,但保持一致)
    const res = await fetch(
      `/api/cs/sessions/${encodeURIComponent(sessionKey)}/close-ticket`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `closeTicketBySession failed: status=${res.status} body=${text}`,
      );
    }
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      data?: {
        ticketId: number;
        ticketNo: string;
        status: 4;
        closedAt: string;
        closedBy: 'user';
      };
      message?: string;
    };
    if (json.code !== 0 || !json.data) {
      throw new Error(
        `closeTicketBySession business error code=${json.code}: ${json.message ?? 'unknown'}`,
      );
    }
    return json.data;
  }
}

let _client: ErpAdminClient | null = null;

/**
 * 单例,避免每次都 new
 */
export function getErpAdminClient(): ErpAdminClient {
  if (!_client) _client = new ErpAdminClient();
  return _client;
}
