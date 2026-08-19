import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import request from '@/services/request';

/**
 * 共享会话的实时对话 hook
 *
 * 拆分自 ConversationPanel:
 *  - 拉历史消息 (REST GET /internal/cs/sessions/:id/messages)
 *  - 拉 sessionKey → 连 /realtime WS,订阅 user_message / operator_reply
 *  - 发送消息 (REST POST /internal/cs/tickets/:id/messages,服务端 WS 回灌;
 *    WS 降级时本地手动 upsert 保证 UI 立即可见)
 *  - 5 分钟间隔分组(组首时间由 MessageGroup 渲染时调 formatGroupTime)
 *
 * @returns  messages / loading / wsState / send / listRef / groups
 */

export type WsState = 'connecting' | 'connected' | 'off' | 'na';

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  status: number;
  metadata: any;
  createdAt: string;
}

export interface SessionInfo {
  sessionId: number;
  sessionKey: string;
  visitorId?: string;
}

export interface MessageGroup {
  /** 锚点时间(首条消息的 createdAt) — 渲染时由 formatGroupTime 计算最终显示 */
  time: string;
  msgs: ChatMessage[];
}

export interface UseConversationApi {
  messages: ChatMessage[];
  loading: boolean;
  wsState: WsState;
  send: (text: string) => Promise<void>;
  listRef: React.RefObject<HTMLDivElement | null>;
  groups: MessageGroup[];
  /** 拉历史失败时抛出的错误;UI 层据此渲染红条 / banner。null 表示未失败。 */
  error: Error | null;
  // cs-round-036:工单已关闭(WS ticket_closed 事件触发)— 输入框 disable + 提示
  ticketClosed: boolean;
}

function resolveWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname } = window.location;
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  // [cs-round-052] 之前写死 `${hostname}:3001/realtime`,prod 模式下 3001 是
  // backend 容器内端口,docker-compose.prod.yml 只 expose、不 ports,host 上根本
  // 监听不到 → 浏览器连 app.suhhai.cn:3001 直接 TCP refused → "实时未连接
  // (降级 REST)"。
  // dev 模式 (make dev-web 起 Vite 5173 + 本机 Node 3001):3001 直监听 → 走
  // hostname:3001 直连后端,无需 nginx。
  // prod 模式 (docker compose 全容器 + nginx):走 api.suhhai.cn(nginx 已配
  // Upgrade 头 + 反代到 backend:3001,Cookie 同 eTLD+1 自动带上)。
  //
  // [cs-round-067] URL 必须以 /realtime 结尾 — socket.io-client 的 namespace
  // 由 URL path 决定;不带 /realtime 时连 default namespace `/`,而 backend
  // gateway `@WebSocketGateway({ namespace: '/realtime' })` 注册在 /realtime
  // namespace,两个 namespace 的 room 完全隔离,emit 永远到不了 default ns 客户端。
  // 对照 ai-cs-demo/src/lib/realtime-client.ts:75 `io(\`${url}/realtime\`, ...)` 即可。
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${wsProto}//${hostname}:3001/realtime`;
  }
  return `${wsProto}//api.suhhai.cn/realtime`;
}

const GROUP_GAP_MS = 5 * 60 * 1000;

export function useConversation(ticketId: number, sessionId: number | null): UseConversationApi {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [wsState, setWsState] = useState<WsState>('connecting');
  // cs-round-036:工单已关闭(用户主动 / 后台客服关)— 输入框 disable,提示"对话已结束"
  const [ticketClosed, setTicketClosed] = useState(false);
  const sockRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<number>>(new Set());

  // 1) 拉历史
  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    request
      .get<any, { messages: ChatMessage[] }>(`/internal/cs/sessions/${sessionId}/messages`)
      .then((data) => {
        if (cancelled) return;
        const list = data?.messages || [];
        setMessages(list);
        knownIds.current = new Set(list.map((m) => m.id));
        setLoading(false);
      })
      .catch(function (e: Error) {
        if (cancelled) return;
        setLoading(false);
        setLoadError(e instanceof Error ? e : new Error(String(e)));
        // eslint-disable-next-line no-console
        console.error('[use-conversation] load history failed:', e);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 2) WS 订阅
  useEffect(() => {
    if (!sessionId) {
      setWsState('na');
      return;
    }
    let cancelled = false;
    let sock: Socket | null = null;

    request
      .get<any, SessionInfo>(`/internal/cs/sessions/${sessionId}/session-info`)
      .then((info) => {
        if (cancelled || !info?.sessionKey) {
          setWsState('off');
          return;
        }
        sock = io(resolveWsUrl(), {
          // cs-round-029:WS 握手鉴权 — 必须同时带 sessionKey + token(INTERNAL_TOKEN)。
          // token 是 server-to-server 的 INTERNAL_TOKEN(env 注入,Vite 用 import.meta.env)。
          // 后端 realtime.gateway.ts:58-67 严格先验 token 再查 sessionKey,缺/错直接 disconnect(true)。
          auth: { sessionKey: info.sessionKey, token: import.meta.env.VITE_INTERNAL_TOKEN },
          transports: ['websocket', 'polling'],
          reconnection: true,
        });
        sockRef.current = sock;
        sock.on('connect', () => setWsState('connected'));
        sock.on('disconnect', () => setWsState('off'));
        sock.on('connect_error', () => setWsState('off'));

        const onPush = (p: any) => {
          if (!p || p.sessionId !== sessionId) return;
          const id = p.messageId;
          if (knownIds.current.has(id)) return;
          knownIds.current.add(id);
          const msg: ChatMessage = {
            id,
            role: p.role,
            content: p.content,
            status: p.status ?? 1,
            metadata: p.metadata ?? null,
            createdAt: p.createdAt,
          };
          setMessages((prev) => [...prev, msg]);
        };
        sock.on('user_message', onPush);
        sock.on('operator_reply', onPush);
        // cs-round-036:工单关闭事件(用户主动 / 后台客服改 status=4 都会 emit)
        sock.on('ticket_closed', () => {
          setTicketClosed(true);
        });
      })
      .catch(() => {
        setWsState('off');
      });

    return () => {
      cancelled = true;
      if (sock) {
        sock.removeAllListeners();
        sock.disconnect();
      }
      sockRef.current = null;
    };
  }, [sessionId]);

  // 自动滚到底
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      try {
        // cs-round-029:后端 reply() 现返回 { ticketId, logId, createdAt, messageId }
        // — 没有 id 字段。解 messageId 当作新消息 id,本地合出 ChatMessage 用于乐观插入。
        const resp = await request.post<
          any,
          { id?: number; messageId?: number | null } & Partial<ChatMessage>
        >(`/internal/cs/tickets/${ticketId}/messages`, { content: text });
        if (resp) {
          const id = resp.id ?? resp.messageId ?? null;
          if (id != null) {
            const created: ChatMessage = {
              id,
              role: resp.role ?? 'assistant',
              content: resp.content ?? text,
              status: resp.status ?? 1,
              metadata: resp.metadata ?? null,
              createdAt: resp.createdAt ?? new Date().toISOString(),
            };
            if (!knownIds.current.has(created.id)) {
              knownIds.current.add(created.id);
              setMessages((prev) => [...prev, created]);
            }
          }
        }
      } catch (e: any) {
        // 抛出由调用方决定是否 toast
        throw e;
      }
    },
    [ticketId],
  );

  // 5 分钟间隔分组(组首时间锚点由 MessageGroup 渲染时计算)
  const groups = useMemo(() => {
    const out: MessageGroup[] = [];
    let prev: number | null = null;
    for (const m of messages) {
      const t = new Date(m.createdAt).getTime();
      if (prev === null || t - prev > GROUP_GAP_MS) {
        out.push({ time: m.createdAt, msgs: [m] });
      } else {
        out[out.length - 1].msgs.push(m);
      }
      prev = t;
    }
    return out;
  }, [messages]);

  return { messages, loading, wsState, send, listRef, groups, error: loadError, ticketClosed };
}
