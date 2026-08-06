'use client';

import { useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import { storedToUIMessages } from '@/lib/refetch-history';

/**
 * useChatState:集中管 page.tsx 里那一堆 useState,减少主组件的噪音。
 *
 * 职责:
 * - abortedIds:本地"已取消"的 assistant message id 集合(用户点 stop 时立即设)
 * - escalationMap:每条 AI 消息的转人工结果(messageId → { escalationId, estimatedWaitMinutes, urgency })
 * - backendSessionId:activeId 对应的后端 cs_session 数字 id(经 upsert 拿到)
 *
 * 副作用(activeId 变化时):
 * 1) setBackendSessionId(activeId 作数字 id,供 useRealtime 作 WS connect key)
 * 2) GET /history → 与已有 messages 做 diff/append(始终跑,cs-round-012 后的契约)
 *
 * cs-round-013:`activeId` 现在是后端数字 id(由 useSessions 从列表接口拿到的),
 * 不再是前端 nanoid sessionKey。history fetch 直接用 backendId,不再走 upsert。
 *
 * `loadedFromLocalRef` 网关在 cs-round-013 删除 — sessions 列表已不持久化在
 * 客户端,history fetch 是**唯一**消息加载路径。RAGChat 在 activeId 变化时
 * 调本 hook → fetch /history → setMessages(diff/append 兜底)。
 */
export interface UseChatStateOptions {
  activeId: string | null;
  /**
   * useChat 的 setMessages — 同时支持「覆盖」(messages: UIMessage[]) 和
   * 「updater」(updater: prev => UIMessage[]) 两种形式。diff/append 避免覆盖
   * 本地有但后端缺的内容引发 paint 闪烁。
   */
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  /**
   * 切 session 闪烁网关(csr013):fetch /history 完成前为 true。
   * RAGChat 用它在 ChatView 上显示「正在加载」,避免 paint 上一会话的旧消息。
   */
  setHistoryLoading: (loading: boolean) => void;
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
  setMessages,
  setHistoryLoading,
}: UseChatStateOptions): UseChatStateResult {
  const [abortedIds, setAbortedIds] = useState<Set<string>>(new Set());
  const [escalationMap, setEscalationMap] = useState<
    Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
  >({});
  const [backendSessionId, setBackendSessionId] = useState<number | null>(null);

  // activeId 变化 → setBackendSessionId + 总是 fetch /history 做 diff/append
  useEffect(() => {
    // cs-round-017:activeId=null = draft 态(点 + 新会话 / 删除最后一个会话),
    // 必须清三件事:
    //   1) setMessages([])         — 右框回到 welcome(6 quick questions)
    //   2) setBackendSessionId(null) — 重置后端 id,避免 useRealtime 用 stale id 继续连 WS
    //   3) setHistoryLoading(false) — 重置 loading,避免残留 spinner
    // 之前是 `if (!activeId) return;` 早返,导致点 + 新会话后右框永远渲染上一会话的旧消息。
    /* eslint-disable react-hooks/set-state-in-effect -- draft 同步重置 3 个 state,缺一会留下 stale */
    if (!activeId) {
      setMessages([]);
      setBackendSessionId(null);
      setHistoryLoading(false);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    const backendIdNum = Number(activeId);
    // activeId 必须是**正**整数 backendId;draft(null) / 非数字 / tempId(负数,创建会话中)
    // 早返 — tempId 期间不 fetch /history(前端已经 sendMessage 在 stream,不需要拉)
    if (!Number.isInteger(backendIdNum) || backendIdNum <= 0) return;
    let cancelled = false;
    setHistoryLoading(true);
    // cs-round-020:切会话先清空 messages(右框不能残留上一会话消息)。
    // 之前是只 setBackendSessionId,useChat 的 messages 常驻 → fetch /history 完成后
    // diff/append 把上一会话 + 当前会话的消息合并显示(A 在上 B 在下)。
    // setMessages([]) 后 fetch 回来 setMessages(restored) 直接替换 — diff/append
    // 仍保留作 streaming metadata 同步的 defense-in-depth。
    // 闪烁网关由 historyLoading 承担(ChatView 显示「正在加载…」)。
    setMessages([]);
    setBackendSessionId(backendIdNum);

    void (async () => {
      try {
        // cs-round-013:history fetch 是**唯一**消息加载路径(不再有 localStorage 兜底)。
        // diff/append:setMessages(prev => [...prev, ...newFromBackend])
        // 后端 0 条 → 不动(prev 保持空,UI 显示 welcome)
        const res = await fetch(`/api/sessions/${backendIdNum}/history`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { messages?: unknown };
        if (cancelled) return;
        const stored = Array.isArray(json.messages)
          ? (json.messages as Parameters<typeof storedToUIMessages>[0])
          : [];
        const restored = storedToUIMessages(stored);
        if (cancelled) return;

        if (restored.length === 0) {
          // 后端空 → 清空前端 messages(draft / 全新会话场景)
          setMessages([]);
          return;
        }
        setMessages((prev) => {
          const localIds = new Set(prev.map((m) => String(m.id)));
          const newFromBackend = restored.filter((m) => !localIds.has(String(m.id)));
          if (newFromBackend.length === 0) {
            // 后端消息已全部在本地(罕见:刚刚 streaming 的 chunk)→ 仅替换以同步 metadata
            return restored;
          }
          return [...prev, ...newFromBackend];
        });
      } catch (e) {
        console.warn('[use-chat-state] load history failed:', (e as Error).message);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setHistoryLoading(false);
    };
    // setMessages 是稳定函数,不进 deps;effect 只依赖 activeId
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
