'use client';

import { useEffect, useRef, useState } from 'react';
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
 * - isGenerating:派生自 status(submitted/streaming 视为生成中)
 * - loadHistory:activeId 变化时拉后端 history,通过 setMessages 灌回(useChat 的 setter)
 *
 * 副作用:
 * - activeId 变化 → ensureBackendSession → setBackendSessionId → GET /history → setMessages
 * - 中断判定:最后一条 assistant,若 status 2/3 → metadata.isInterrupted=true
 */
export interface UseChatStateOptions {
  activeId: string | null;
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
  /** 标位:刚灌完 history,下一帧的 write-back 跳过 */
  justLoadedRef: React.MutableRefObject<boolean>;
}

export function useChatState({ activeId, setMessages }: UseChatStateOptions): UseChatStateResult {
  const [abortedIds, setAbortedIds] = useState<Set<string>>(new Set());
  const [escalationMap, setEscalationMap] = useState<
    Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
  >({});
  const [backendSessionId, setBackendSessionId] = useState<number | null>(null);
  const justLoadedRef = useRef(false);

  // A 方案:activeId 变化时,upsert backend session + 拉 history + setMessages
  useEffect(() => {
    if (!activeId) return;
    const visitorId = getVisitorId();
    let cancelled = false;

    (async () => {
      try {
        const userId = getClientUserId();
        const backendId = await ensureBackendSession(activeId, visitorId, userId);
        if (cancelled) return;
        setBackendSessionId(backendId);

        const res = await fetch(`/api/sessions/${backendId}/history`);
        if (!res.ok) return;
        const json = await res.json();
        const stored: StoredMessage[] = Array.isArray(json.messages) ? json.messages : [];
        if (stored.length === 0) return;
        if (cancelled) return;

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
        justLoadedRef.current = true;
        setMessages(restored as unknown as UIMessage[]);
      } catch (e) {
        console.warn('[use-chat-state] load history failed:', (e as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId, setMessages]);

  return {
    abortedIds,
    setAbortedIds,
    escalationMap,
    setEscalationMap,
    backendSessionId,
    justLoadedRef,
  };
}
