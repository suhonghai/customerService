/**
 * api-client — V1 ai-cs-demo 调 backend internal API 的 HTTP 客户端(S6)
 *
 * 用途:
 *   MCP server 子进程(customer-service.ts)需要调用 erp-admin backend 查
 *   真实订单 / 写工单。本模块封装 HTTP 调用 + 重试 + 鉴权 + tenantId 注入,
 *   让 customer-service.ts 不再读 mock-orders.json / mock 工单。
 *
 * 与 src/lib/erp-admin-client.ts 的关系:
 *   - erp-admin-client.ts 是 Next.js 服务端用的(走 src/lib/env.ts + 持久 token)
 *   - 本 api-client.ts 是 tsx 子进程用的(独立 dynamic import + dynamic env loader)
 *   - 两者 API 类似但用途不同:本模块专为 MCP server 设计,带 retry + 简洁错误
 *
 * 安全:
 *   - 所有请求自动带 X-Internal-Token(INTERNAL_TOKEN 鉴权)
 *   - tenantId 在 header 里走 X-Tenant-Id(V1 默认 NULL,但接口预留)
 *   - customerId/userId 通过参数显式传入,不在 client 层做隐式注入
 *
 * 重试策略:
 *   - 网络错误(ECONNREFUSED / fetch throw)→ 重试 2 次,指数退避 100ms / 300ms
 *   - HTTP 5xx → 重试 1 次(避免 backend 短暂 502 把 LLM 卡死)
 *   - HTTP 4xx → 不重试(参数错,重试也错)
 *   - 业务 code !== 0 → 不重试(透传给上层处理)
 */

import { env, getErpAdminToken } from './env';

export interface BackendOrder {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  totalAmount: string;
  payAmount: string;
  payStatus: number;
  orderStatus: number;
  shipNo: string | null;
  shipCompany: string | null;
  address: string | null;
  items: Array<{
    id: number;
    productId: string;
    productName: string;
    price: string;
    quantity: number;
    subtotal: string;
  }>;
  createdAt: string;
  paidAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
}

export interface BackendTicket {
  id: number;
  ticketNo: string;
  status: number;
  priority: number;
  title: string;
  content: string;
  slaDeadline: string;
  creatorId: number;
}

interface BackendResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

/**
 * V1 后端统一响应:{ code, message, data }
 * 业务成功:code === 0
 * 业务失败:code !== 0 → throw new BackendApiError(message, code)
 */
export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'BackendApiError';
  }
}

/**
 * 主入口:getInternalToken / getBaseUrl
 *
 * MCP server 子进程通过 ensureEnvImports() 在第一次调用前 dynamic import
 * src/lib/env.ts(同 customer-service.ts 的现有 pattern)。
 */
async function getBaseUrl(): Promise<string> {
  return env.ERP_ADMIN_URL;
}

async function getToken(): Promise<string> {
  const t = getErpAdminToken();
  if (!t) {
    throw new BackendApiError(
      'INTERNAL_TOKEN 未配置(需要 ERP_ADMIN_INTERNAL_TOKEN / ERP_ADMIN_TOKEN / INTERNAL_TOKEN 之一)',
      -1,
    );
  }
  return t;
}

/**
 * 内部 fetch wrapper,带重试 + 鉴权 + tenant header
 *
 * - 自动把 X-Internal-Token 加上
 * - tenantId(V1 预留):不为空时加 X-Tenant-Id header
 * - 网络错误 / 5xx → 重试
 * - 4xx / 业务 code !== 0 → 抛 BackendApiError
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: {
    tenantId?: number | string | null;
    retries?: number;
  } = {},
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const token = await getToken();
  const maxRetries = opts.retries ?? 2;
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Internal-Token': token,
  };
  if (opts.tenantId !== undefined && opts.tenantId !== null && opts.tenantId !== '') {
    headers['X-Tenant-Id'] = String(opts.tenantId);
  }
  // 用户传的 headers 覆盖默认(允许调用方 override)
  if (init.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers });
      // 5xx → 重试(1 次);4xx → 直接抛
      if (res.status >= 500 && attempt < maxRetries) {
        lastErr = new BackendApiError(`erp-admin ${res.status}`, res.status);
        await sleep(100 * Math.pow(3, attempt));
        continue;
      }
      const json = (await res.json().catch(() => ({}))) as BackendResponse<T>;
      if (!json || json.code === undefined) {
        throw new BackendApiError(`erp-admin 响应非 JSON: status=${res.status}`, -1, res.status);
      }
      if (json.code !== 0) {
        throw new BackendApiError(
          json.message || `erp-admin 业务错误 code=${json.code}`,
          json.code,
          res.status,
        );
      }
      if (json.data === null || json.data === undefined) {
        // 业务成功但无数据(如订单不存在)
        return null as T;
      }
      return json.data;
    } catch (e) {
      lastErr = e;
      // fetch throw(ECONNREFUSED / timeout) → 重试
      if (e instanceof TypeError && attempt < maxRetries && String(e.message).includes('fetch')) {
        await sleep(100 * Math.pow(3, attempt));
        continue;
      }
      // 已是 BackendApiError 且 4xx → 不重试
      if (e instanceof BackendApiError && e.httpStatus && e.httpStatus < 500) {
        throw e;
      }
      // 其他错误 → 重试到上限再抛
      if (attempt >= maxRetries) {
        throw e;
      }
      await sleep(100 * Math.pow(3, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ 公开 API ============

/**
 * GET /api/internal/cs/orders/:orderNo
 *
 * 查单个订单(按订单号)。订单不存在返 null(不抛)。
 */
export async function getOrderByOrderNo(
  orderNo: string,
  opts: { tenantId?: number | string | null } = {},
): Promise<BackendOrder | null> {
  try {
    return await request<BackendOrder>(
      `/api/internal/cs/orders/${encodeURIComponent(orderNo)}`,
      { method: 'GET' },
      opts,
    );
  } catch (e) {
    if (e instanceof BackendApiError && (e.code === 404 || e.code === 1404)) {
      return null;
    }
    throw e;
  }
}

/**
 * GET /api/internal/cs/orders?sessionKey=X[&status=Y]
 *
 * W11 C-FULL:服务端从 sessionKey → csSession.userId → Order.userId 反查;
 *   不再接受 userId 查询参数(防止 IDOR)。
 *
 * 安全:即使攻击者构造 ?userId=X query,backend 也只信任 sessionKey,
 *   并忽略 userId 参数(后端 controller 显式声明不接受 userId)。
 */
export interface ListOrdersParams {
  sessionKey: string;
  status?: 'paid' | 'shipped' | 'pending' | 'refunding' | 'all';
  tenantId?: number | string | null;
}

export async function listActiveOrders(params: ListOrdersParams): Promise<BackendOrder[]> {
  if (!params.sessionKey || typeof params.sessionKey !== 'string') {
    throw new BackendApiError('listActiveOrders: sessionKey 必传', -1);
  }
  const search = new URLSearchParams();
  search.set('sessionKey', params.sessionKey.trim());
  if (params.status && params.status !== 'all') {
    search.set('status', params.status);
  }
  const data = await request<BackendOrder[]>(
    `/api/internal/cs/orders?${search.toString()}`,
    { method: 'GET' },
    { tenantId: params.tenantId },
  );
  return data ?? [];
}

/**
 * POST /api/internal/cs/tickets
 *
 * 创建工单(create_ticket MCP 工具)。
 *
 * V1 决策(S6):relatedOrderId 通过 content 字段透传(MCP 阶段 string orderNo
 * 与 backend number FK 对不齐,先不带 relatedOrderId FK,记到 content 里)。
 */
export interface CreateTicketParams {
  title: string;
  content: string;
  priority: number; // 1=high / 2=normal / 3=low
  category?: string;
  relatedOrderNo?: string;
  tenantId?: number | string | null;
}

export async function createTicket(params: CreateTicketParams): Promise<BackendTicket> {
  const ticket = await request<BackendTicket>(
    '/api/internal/cs/tickets',
    {
      method: 'POST',
      body: JSON.stringify({
        title: params.title,
        content: params.content,
        priority: params.priority,
        category: params.category ?? 'ai-cs-demo',
      }),
    },
    { tenantId: params.tenantId },
  );
  if (!ticket) {
    throw new BackendApiError('createTicket 返回 data 为空', -1);
  }
  return ticket;
}

/**
 * POST /api/internal/cs/escalations
 *
 * 转人工工单。V1 复用 W9-10 已有 endpoint(S7 不变)。
 */
export interface CreateEscalationParams {
  subject: string;
  content: string;
  priority?: number;
  sessionKey?: string;
  userId?: string | number;
  tenantId?: number | string | null;
}

export interface BackendEscalation {
  id: number;
  ticketId: number;
  ticketNo: string;
  code: string;
  priority: number;
  slaDeadline: string;
  category: string;
}

export async function createEscalation(params: CreateEscalationParams): Promise<BackendEscalation> {
  const data = await request<BackendEscalation>(
    '/api/internal/cs/escalations',
    {
      method: 'POST',
      body: JSON.stringify({
        subject: params.subject,
        content: params.content,
        priority: params.priority,
        sessionKey: params.sessionKey,
        userId: params.userId !== undefined ? String(params.userId) : undefined,
      }),
    },
    { tenantId: params.tenantId },
  );
  if (!data) {
    throw new BackendApiError('createEscalation 返回 data 为空', -1);
  }
  return data;
}
