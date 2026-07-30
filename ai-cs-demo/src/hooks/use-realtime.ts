'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import {
  connectRealtime,
  onOperatorReply,
  disconnectRealtime,
  type OperatorReplyPayload,
} from '@/lib/realtime-client';
import { refetchSessionHistory } from '@/lib/refetch-history';

/**
 * useRealtime:把 connectRealtime / onOperatorReply / disconnectRealtime 三个底层 API
 * 装配成一个声明式 hook,让上层只关心"哪个 session 要订阅 / 什么时候回调"。
 *
 * - sessionKey 变化 → 重连(connectRealtime 内部按 key 复用 / 重连)
 * - handler 变化 → 自动取消旧 handler,注册新 handler
 * - 组件 unmount 时不断开 WS(切 session 时由新 effect 用新 key 重连;disconnectRealtime 留给顶层 App unmount)
 *
 * W11:增加 reconnect recovery — socket.io v4 的 connectionStateRecovery 在
 * 服务端 offset 过期时会失效,reconnect 后 server 不再回放 missed events。
 * 此时通过 GET /api/sessions/[id]/history diff 补漏,只把 client 没见过的 message id 加进来,
 * 避免覆盖正在 streaming 的 message(getKnownMessageIds 由 caller 提供)。
 *
 * 用法:
 *   useRealtime({
 *     sessionKey: activeId,
 *     onMessage: (payload) => { ... },
 *     enabled: backendSessionId != null,
 *     backendSessionId,
 *     onRecover: (msgs) => { ... },
 *     getKnownMessageIds: () => new Set(messages.map(m => m.id)),
 *   })
 */
export interface UseRealtimeOptions {
  sessionKey: string | null | undefined;
  /** 是否启用;false 时不建立连接(常用于 backendSessionId 还没拿到时) */
  enabled?: boolean;
  /** 收到 operator_reply 时触发;只在 payload.sessionId 与当前 active 的后端 session 匹配时调用 */
  onMessage: (payload: OperatorReplyPayload) => void;
  /** 后端 session id(用于 reconnect recovery 时拉 history diff) */
  backendSessionId?: number | null;
  /** reconnect 后 server side recovery 失效 → GET /api/sessions/[id]/history diff 补漏 */
  onRecover?: (recoveredMessages: UIMessage[]) => void;
  /** 当前 client 持有的 message id 集合,供 diff 用(避免覆盖正在 streaming 的 message) */
  getKnownMessageIds?: () => Set<string>;
}

export function useRealtime({
  sessionKey,
  enabled = true,
  onMessage,
  backendSessionId,
  onRecover,
  getKnownMessageIds,
}: UseRealtimeOptions) {
  // 首次连接不算 reconnect(recovery ref:跳过补漏)
  const isFirstConnectRef = useRef(true);
  useEffect(() => {
    if (!enabled || !sessionKey) return;
    const sock = connectRealtime(sessionKey);
    sock.on('connect', () => console.log('[realtime] connected sessionKey=', sessionKey));
    sock.on('disconnect', (r) => console.log('[realtime] disconnected:', r));
    sock.on('connect_error', (e) => console.warn('[realtime] connect_error:', e.message));
    sock.on('connect', async () => {
      // 已被 connectionStateRecovery 恢复 → 跳过补漏
      const socketInternal = sock as unknown as {
        recovered?: boolean;
        previousSession?: unknown;
      };
      if (socketInternal.recovered) {
        console.log('[realtime] recovered by connectionStateRecovery');
        return;
      }
      // 首次连接 → 跳过,标记后续连接为 reconnect
      if (isFirstConnectRef.current) {
        isFirstConnectRef.current = false;
        return;
      }
      // 非首次 + 未被 server 恢复 → 拉 history diff 补漏
      if (!backendSessionId || !onRecover || !getKnownMessageIds) return;
      console.log('[realtime] reconnect without recovery, refetching history');
      try {
        const history = await refetchSessionHistory(backendSessionId);
        const known = getKnownMessageIds();
        const recovered = history.filter((m) => !known.has(m.id));
        if (recovered.length > 0) {
          console.log(`[realtime] recovered ${recovered.length} messages`);
          onRecover(recovered);
        }
      } catch (e) {
        console.warn('[realtime] refetch history failed:', (e as Error).message);
      }
    });
    const off = onOperatorReply(onMessage);
    return () => {
      off();
    };
    // onMessage / onRecover / getKnownMessageIds 变化不重连(handler 由 off/on 自然 swap);
    // recovery 逻辑直接读最新 closure(每次 connect 触发时调用)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, enabled, backendSessionId, onRecover, getKnownMessageIds]);
}

/** App unmount 时断开 WS(独立 hook,挂在根组件即可) */
export function useRealtimeDisconnectOnUnmount() {
  useEffect(() => {
    return () => {
      disconnectRealtime();
    };
  }, []);
}
