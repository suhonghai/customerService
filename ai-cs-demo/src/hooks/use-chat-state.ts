'use client';

import { useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import { storedToUIMessages } from '@/lib/refetch-history';
import { ensureBackendSession } from '@/lib/backend-session';
import { getVisitorId } from '@/lib/visitor';
import { getClientUserId } from '@/lib/auth';

/**
 * useChatState:集中管 page.tsx 里那一堆 useState,减少主组件的噪音。
 *
 * 职责:
 * - abortedIds:本地"已取消"的 assistant message id 集合(用户点 stop 时立即设)
 * - escalationMap:每条 AI 消息的转人工结果(messageId → { escalationId, estimatedWaitMinutes, urgency })
 * - backendSessionId:activeId 对应的后端 cs_session 数字 id(经 upsert 拿到)
 *
 * 副作用(activeId 变化时):
 * 1) ensureBackendSession → setBackendSessionId(供 useRealtime 作 WS connect key)
 * 2) GET /history → 与已有 messages 做 diff/append(永远跑,不只是 loadedFromLocalRef=false)
 *
 * cs-round-012 修复:不再因为 loadedFromLocalRef=true 跳过 /history fetch。
 * 之前短路逻辑导致「localStorage 有 user 消息但没 assistant 占位(session 流式被客户端
 * 断开 → assistant 占位没 append 到 localStorage)」的场景下,刷新进入页面只看得到
 * user 消息 — DB 里的 assistant 内容永远不会被前端拉取,即便 cs-round-011 已经把
 * placeholder 落库 + refetch-history 标了 isStreaming/continueFromMessageId。
 *
 * 修法:永远 fetch /history,用 setMessages(prev => [...prev, ...backendOnly]) 做
 * diff/append — 本地有就不覆盖(避免闪烁),只把后端新增的 message append 上去。
 * 这样 cs-round-011 的「自动续推」机制(useAutoResumeStreaming 看到 isStreaming 才
 * 触发)才会被真正激活。
 *
 * 拆分说明(2026-08-04 切 session 闪烁修复保留):
 * - RAGChat 用 useLayoutEffect 同步从 localStorage 加载消息,paint 前完成 — 这是
 *   paint 不闪的关键(避免 paint 旧消息再 paint 新消息)
 * - useChatState 拿到 ref 后做 diff/append,**不覆盖**本地消息,所以 paint 不会重画
 * - ensureBackendSession 必跑:WS 需要 backendSessionId 作 connect key
 *
 * 中断判定(保留):最后一条 assistant,若 status 2/3 → metadata.isInterrupted=true,
 * ChatView 拿到这个标记会触发静默 regenerate。
 */
export interface UseChatStateOptions {
  activeId: string | null;
  /**
   * RAGChat 在 useLayoutEffect 内同步加载完 localStorage 消息后置 true。
   * useChatState 的 useEffect 读到这个标记 → 跳过 /history fetch(避免 race)。
   *
   * 用 ref 而不是 state:effect 不会因为 ref 变化重跑,且 ref.current 写入时机
   * 由 useLayoutEffect 保证在 useEffect 之前(同步执行)。
   */
  loadedFromLocalRef: React.MutableRefObject<boolean>;
  /**
   * useChat 的 setMessages — 同时支持「覆盖」(messages: UIMessage[]) 和
   * 「updater 」(updater: prev => UIMessage[]) 两种形式。cs-round-012
   * 用 updater 做 diff/append,避免覆盖本地有但后端缺的内容引发 paint 闪烁。
   */
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
}

export interface UseChatStateResult {
  abortedIds: Set<string>;
  setAbortedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  escalationMap: Record<
    string,
    { escalationId: string; estimatedWaitMinutes: number; urgency: string }
  >;
  setEscalationMap: React.Dispatch<
    React.SetStateAction<
      Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
    >
  >;
  backendSessionId: number | null;
}

export function useChatState({
  activeId,
  loadedFromLocalRef,
  setMessages,
}: UseChatStateOptions): UseChatStateResult {
  const [abortedIds, setAbortedIds] = useState<Set<string>>(new Set());
  const [escalationMap, setEscalationMap] = useState<
    Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
  >({});
  const [backendSessionId, setBackendSessionId] = useState<number | null>(null);

  // activeId 变化 → upsert backend session + 总是 fetch /history 做 diff/append
  useEffect(() => {
    if (!activeId) return;
    const visitorId = getVisitorId();
    let cancelled = false;

    void (async () => {
      try {
        const userId = getClientUserId();
        const backendId = await ensureBackendSession(activeId, visitorId, userId);
        if (cancelled) return;
        setBackendSessionId(backendId);

        // cs-round-012:即使 loadedFromLocalRef=true 也 fetch /history。
        // 用 setMessages(prev => [...prev, ...backendOnly]) 做 diff/append —
        // 不覆盖本地有内容,只把后端有但本地没的 append 上去。这样 cs-round-011
        // 的「自动续推」(依赖 metadata.isStreaming 标)才能真正生效:
        // - 之前流式被客户端断开 → assistant 占位没 append 到 localStorage
        // - 刷新进入 → localStorage 只有 user 消息,后端 /history 返回 user + assistant
        // - diff/append 把 assistant append 到 messages,isStreaming 触发 auto-resume
        const res = await fetch(`/api/sessions/${backendId}/history`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { messages?: unknown };
        if (cancelled) return;
        const stored = Array.isArray(json.messages) ? (json.messages as Parameters<typeof storedToUIMessages>[0]) : [];
        const restored = storedToUIMessages(stored);
        if (cancelled) return;

        // diff/append:setMessages((prev) => [...prev, ...newFromBackend])
        // 后端 0 条 → 不动(prev 已经是 localStorage 加载的,清空会闪)
        if (restored.length === 0) return;
        setMessages((prev) => {
          const localIds = new Set(prev.map((m) => String(m.id)));
          const newFromBackend = restored.filter((m) => !localIds.has(String(m.id)));
          if (newFromBackend.length === 0) return prev;
          return [...prev, ...newFromBackend];
        });
      } catch (e) {
        console.warn('[use-chat-state] load history failed:', (e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
    // loadedFromLocalRef / setMessages 是 ref / 稳定函数,不进 deps;effect 只依赖 activeId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return {
    abortedIds,
    setAbortedIds,
    escalationMap,
    setEscalationMap,
    backendSessionId,
  };
}