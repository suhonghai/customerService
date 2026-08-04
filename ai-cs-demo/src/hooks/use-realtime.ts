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

  // ── 2026-08-04 修复:把不稳定的函数引用缓存到 ref ──
  // 调用方(page.tsx)每次 render 都会传新 onMessage / onRecover / getKnownMessageIds 闭包,
  // 旧实现把 onRecover / getKnownMessageIds 放进 effect deps → 每次 render effect 重跑 →
  // sock.on('connect', ...) listener 累积 + connectRealtime 重调 → WS reconnect 时所有
  // 累积的 listener 都触发 refetchSessionHistory → /api/chat 流式期间 history 雪崩
  // 改法:用 ref 缓存最新 callback,effect 只依赖 [sessionKey, enabled, backendSessionId]
  // 三个稳定值;handler 内通过 ref 读最新 callback(避免 effect 重跑 + 闭包陷阱)。
  const onMessageRef = useRef(onMessage);
  const onRecoverRef = useRef(onRecover);
  const getKnownMessageIdsRef = useRef(getKnownMessageIds);
  // 无依赖 useEffect:每次 render 同步 ref(不写返回值,不依赖 effect 时序)
  useEffect(() => {
    onMessageRef.current = onMessage;
    onRecoverRef.current = onRecover;
    getKnownMessageIdsRef.current = getKnownMessageIds;
  });

  useEffect(() => {
    if (!enabled || !sessionKey) return;
    const sock = connectRealtime(sessionKey);

    // 用局部 const 持有 listener 引用,cleanup 才能精确 off 掉(防 listener 累积)
    const onConnect = () => console.log('[realtime] connected sessionKey=', sessionKey);
    const onDisconnect = (r: unknown) => console.log('[realtime] disconnected:', r);
    const onConnectError = (e: Error) =>
      console.warn('[realtime] connect_error:', e.message);
    const onConnectRecover = async () => {
      // 已被 connectionStateRecovery 恢复 → 跳过补漏
      const socketInternal = sock as unknown as { recovered?: boolean };
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
      // 注:用 ref 读最新 callback(避免 effect 闭包陷阱 + 闭包内 callback 引用过期)
      const onRecover = onRecoverRef.current;
      const getKnownMessageIds = getKnownMessageIdsRef.current;
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
    };

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    sock.on('connect_error', onConnectError);
    sock.on('connect', onConnectRecover);

    // onOperatorReply handler 也用 ref 读最新 onMessage(避免 stale closure)
    const off = onOperatorReply((payload) => {
      onMessageRef.current?.(payload);
    });

    return () => {
      // cleanup:精确移除所有 sock.on() listener(防累积 leak)
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      sock.off('connect_error', onConnectError);
      sock.off('connect', onConnectRecover);
      off();
    };
    // 依赖精简为 3 个稳定值:onMessage / onRecover / getKnownMessageIds 通过 ref 读最新
  }, [sessionKey, enabled, backendSessionId]);
}

/** App unmount 时断开 WS(独立 hook,挂在根组件即可) */
export function useRealtimeDisconnectOnUnmount() {
  useEffect(() => {
    return () => {
      disconnectRealtime();
    };
  }, []);
}
