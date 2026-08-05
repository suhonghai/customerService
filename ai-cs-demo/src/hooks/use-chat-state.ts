'use client';

import { useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import { storedToUIMessage } from '@/lib/message-converter';
import { ensureBackendSession } from '@/lib/backend-session';
import { getVisitorId } from '@/lib/visitor';
import { getClientUserId } from '@/lib/auth';
import type { StoredMessage } from '@/lib/erp-admin-client';

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
 * 2) 若 loadedFromLocalRef.current=false(localStorage 空)→ GET /history → setMessages
 *
 * 拆分说明(2026-08-04 切 session 闪烁修复):
 * - RAGChat 用 useLayoutEffect 同步从 localStorage 加载消息,paint 前完成,
 *   loadedFromLocalRef.current 置 true → useChatState 跳过 /history fetch
 * - 单一来源路径:有 local 用 local(同步),无 local 用 backend(异步)。
 *   消除"B.local → B.backend"两次 setMessages 的 race → 消除切 session 闪烁第 2 次。
 * - ensureBackendSession 必跑:WS 需要 backendSessionId 作 connect key
 *   (与是否本地有消息无关)。
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
  setMessages: (messages: UIMessage[]) => void;
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

  // activeId 变化 → upsert backend session + (可选) 拉 history
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

        // RAGChat 已在 useLayoutEffect 同步从 localStorage 加载 → 跳过 fetch
        // 消除"先 B.local(同步)→ 再 B.backend(异步 150ms 后)"两次 setMessages 的 flicker
        if (loadedFromLocalRef.current) return;

        // RAGChat 没从 local 加载(可能 backend merge 来的空 session,或首问)→ fetch
        const res = await fetch(`/api/sessions/${backendId}/history`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { messages?: unknown };
        const stored: StoredMessage[] = Array.isArray(json.messages) ? json.messages : [];
        if (cancelled || stored.length === 0) return;

        let lastAssistantIdx = -1;
        for (let i = stored.length - 1; i >= 0; i--) {
          if (stored[i].role === 'assistant') {
            lastAssistantIdx = i;
            break;
          }
        }
        const restored = stored.map((m, i) => {
          const isLastAssistant = i === lastAssistantIdx;
          const interrupted = isLastAssistant && (m.status === 2 || m.status === 3);
          const errored = isLastAssistant && m.status === 4;
          const ui = storedToUIMessage(m, interrupted);
          if (!errored) return ui;
          const errorMessage =
            m.metadata && typeof m.metadata === 'object'
              ? ((m.metadata as Record<string, unknown>).errorMessage as string | undefined)
              : undefined;
          return {
            ...ui,
            metadata: { ...ui.metadata, errored: true, errorMessage },
          };
        });
        setMessages(restored as unknown as UIMessage[]);
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