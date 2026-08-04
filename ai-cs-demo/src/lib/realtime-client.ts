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
  return socket;
}

export function onOperatorReply(handler: (p: OperatorReplyPayload) => void): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function disconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
    subscribedKey = null;
  }
}
