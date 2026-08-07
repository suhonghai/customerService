'use client';
import { io, Socket } from 'socket.io-client';

/**
 * operator_reply event shape mirrored from backend
 * W11-erp-admin/erp-admin-backend/src/modules/ws/realtime.gateway.ts
 */
export interface OperatorReplyPayload {
  sessionId: number;
  messageId: number;
  role: 'assistant' | 'user' | 'system' | 'tool';
  content: string;
  status: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  // 业务 id(W11 erp-admin 后端 emit 已带,前端气泡显示工单号 + 客服名)
  ticketNo: string;
  operatorName: string;
}

let socket: Socket | null = null;
let subscribedKey: string | null = null;
const handlers = new Set<(p: OperatorReplyPayload) => void>();

// cs-round-036:工单关闭事件(ai-cs + erp 前台订阅,关闭后切终止 UI / 输入框 disable)
export interface TicketClosedPayload {
  ticketId: number;
  ticketNo: string;
  status: 4;
  closedAt: string;
  closedBy: 'user' | 'operator';
}
const ticketClosedHandlers = new Set<(p: TicketClosedPayload) => void>();

// cs-round-037:工单创建事件(ai-cs 端订阅,收到后 setSessionHasOpenTicket(true) 显示 banner)
//   防 RAGChat mount 时 ticket 还没创建 → useEffect 拉不到 → 永远不显示 banner 的竞态
export interface TicketCreatedPayload {
  ticketId: number;
  ticketNo: string;
  status: number;
  priority: number;
}
const ticketCreatedHandlers = new Set<(p: TicketCreatedPayload) => void>();

/**
 * Connect WS server, auth with sessionKey. Idempotent — re-using the same
 * sessionKey returns the existing socket. Reconnect is automatic.
 *
 * NEXT_PUBLIC_WS_URL lets prod override the WS host; default = current
 * origin (proxies ws:// through next dev) in dev, falls back to localhost:3001.
 */
export function connectRealtime(sessionKey: string): Socket {
  if (socket && socket.connected && subscribedKey === sessionKey) {
    return socket;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  const url =
    process.env.NEXT_PUBLIC_WS_URL ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'http://localhost:3001');

  socket = io(`${url}/realtime`, {
    // cs-round-007(#24):WS 握手鉴权 — 必须同时带 sessionKey + token。
    // token 是 server-to-server 的 INTERNAL_TOKEN(env 注入,前端不需要单独 secret 管理)。
    // 后端 handleConnection 会先验 token 再查 sessionKey,缺/错直接 disconnect。
    auth: { sessionKey, token: process.env.NEXT_PUBLIC_INTERNAL_TOKEN ?? '' },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });
  subscribedKey = sessionKey;
  socket.on('operator_reply', (payload: OperatorReplyPayload) => {
    handlers.forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        console.error('[realtime] handler', e);
      }
    });
  });
  // cs-round-036:工单关闭事件分发
  socket.on('ticket_closed', (payload: TicketClosedPayload) => {
    ticketClosedHandlers.forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        console.error('[realtime] ticket_closed handler', e);
      }
    });
  });
  // cs-round-037:工单创建事件分发
  socket.on('ticket_created', (payload: TicketCreatedPayload) => {
    ticketCreatedHandlers.forEach((h) => {
      try {
        h(payload);
      } catch (e) {
        console.error('[realtime] ticket_created handler', e);
      }
    });
  });
  return socket;
}

export function onOperatorReply(handler: (p: OperatorReplyPayload) => void): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

// cs-round-036:订阅 ticket_closed 事件,收到后切换到终止 UI
export function onTicketClosed(
  handler: (p: TicketClosedPayload) => void,
): () => void {
  ticketClosedHandlers.add(handler);
  return () => {
    ticketClosedHandlers.delete(handler);
  };
}

// cs-round-037:订阅 ticket_created 事件,收到后 setSessionHasOpenTicket(true)
export function onTicketCreated(
  handler: (p: TicketCreatedPayload) => void,
): () => void {
  ticketCreatedHandlers.add(handler);
  return () => {
    ticketCreatedHandlers.delete(handler);
  };
}

export function disconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
    subscribedKey = null;
  }
}
