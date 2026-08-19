'use client';

import { useEffect, useRef, useState } from 'react';
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
  /**
   * cs-round-064:useChat 的 status。activeId 从 draft/tempId 切到 backendId 时,
   * 若 status 是 'submitted'/'streaming'(本地正在流),跳过 fetch /history —
   * 否则 /history 拉回的 status=2 placeholder 与本地 useChat 流的 placeholder
   * 是两条 msg,触发 useAutoResumeStreaming 误续推(chat #2)。
   *
   * 切会话 / 刷新场景 status='ready' 或 'error' → 仍走 fetch(本字段无效)。
   */
  chatStatus?: 'submitted' | 'streaming' | 'ready' | 'error';
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
  chatStatus,
}: UseChatStateOptions): UseChatStateResult {
  const [abortedIds, setAbortedIds] = useState<Set<string>>(new Set());
  const [escalationMap, setEscalationMap] = useState<
    Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
  >({});
  const [backendSessionId, setBackendSessionId] = useState<number | null>(null);

  // cs-round-064:同步 chatStatus 到 ref,避免 status 变化触发 activeId effect 重跑
  // (status 在 sendMessage 期间 'submitted'→'streaming'→'ready' 会变 2-3 次,
  //  如果进 deps 会让 activeId effect 重复跑甚至多 fetch)。
  const chatStatusRef = useRef<'submitted' | 'streaming' | 'ready' | 'error' | undefined>(
    chatStatus,
  );
  useEffect(() => {
    chatStatusRef.current = chatStatus;
  }, [chatStatus]);

  // cs-round-021:history fetch dedupe refs —
  //   fetchedSessionIdsRef:已成功 fetch 完的 sessionId(防御 StrictMode dev 双调 effect)
  //   inFlightSessionIdRef:当前正在 fetch 的 sessionId(防止并发重入)
  // prevActiveIdRef 区分「URL 变化(切会话)」vs「StrictMode 同 activeId 重跑」:
  //   切会话 → 清空两个 ref,新会话正常 fetch
  //   同 activeId 重跑 → 保留 ref,dedupe 拦住二次 fetch(防死循环)
  const fetchedSessionIdsRef = useRef<Set<string>>(new Set());
  const inFlightSessionIdRef = useRef<string | null>(null);
  const prevActiveIdRef = useRef<string | null | undefined>(undefined);

  // activeId 变化 → setBackendSessionId + 总是 fetch /history 做 diff/append
  useEffect(() => {
    // cs-round-021:切会话(URL 变化 → activeId 变)才清空 dedupe state;
    // StrictMode 同 activeId 重跑不清空,dedupe 才能拦住重复 fetch。
    // [cs-round-054] 同时保留「旧 prev」给下面的 prevIsOtherBackend 判断用 —
    //   effect 内先把 prev 快照存到 prevActiveIdBeforeUpdate,再写 ref,
    //   否则 prevActiveIdRef.current 已经被 activeId 覆盖,下面的判断就失真。
    const prevActiveIdBeforeUpdate = prevActiveIdRef.current;
    if (prevActiveIdRef.current !== activeId) {
      fetchedSessionIdsRef.current.clear();
      inFlightSessionIdRef.current = null;
      prevActiveIdRef.current = activeId ?? null;
    }
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

    // cs-round-021:dedupe — 同 sessionId 已在 fetch(in-flight)或已 fetch 过,跳过 fetch 动作
    // 跳过只省 fetch + setMessages,state 重置(setMessages([])/setBackendSessionId/setHistoryLoading)
    // 仍执行 — 切会话的闪烁网关由 historyLoading 承担,不能因为 dedupe 跳过而留 stale。
    if (
      inFlightSessionIdRef.current === activeId ||
      fetchedSessionIdsRef.current.has(activeId)
    ) {
      return;
    }
    inFlightSessionIdRef.current = activeId;

    let cancelled = false;
    setHistoryLoading(true);
    // [cs-round-054] 切会话清空 messages 的判断条件收紧:
    //   - 仅当「上一个 activeId 是已知的 backendId(正整数)」且「与当前不同」时才清空
    //     — 即用户从 A 会话切到 B 会话(A、B 都是已有 backendId)。
    //   - 其他情况**不**清空:
    //     a) prevActiveId === undefined     : 首次 mount(SSR/hydration),useChat state 是初始值,不必清
    //     b) prevActiveId === null          : 从 draft 态(刚刚 + 新会话)切到 backendId
    //                                       — useChat 内部已经在 streaming(刚 sendMessage push 了 user message),
    //                                         清空会把 user message 抹掉 + 跟 SSE chunks race
    //                                         → 用户看不到自己发的气泡(refresh 才看到,截图 9/10)。
    //     c) prevActiveId 是 tempId(负数)    : createSession 同步路径留下的中间态,
    //                                       onCommit 把 URL 切到 backendId;同上 useChat 正在 streaming,
    //                                       不能清空。
    //   - 这些情况下保留 useChat state,fetch /history 回来后用 diff/append
    //     (line ~163)合并 — 已有的 user message 不丢,新拉到的 assistant message 也不会被覆盖。
    const prev = prevActiveIdBeforeUpdate;
    const prevIsOtherBackend =
      typeof prev === 'string' &&
      /^\d+$/.test(prev) &&
      Number(prev) > 0 &&
      prev !== activeId;
    if (prevIsOtherBackend) {
      // cs-round-020:切会话先清空 messages(右框不能残留上一会话消息)。
      // 之前是只 setBackendSessionId,useChat 的 messages 常驻 → fetch /history 完成后
      // diff/append 把上一会话 + 当前会话的消息合并显示(A 在上 B 在下)。
      // setMessages([]) 后 fetch 回来 setMessages(restored) 直接替换 — diff/append
      // 仍保留作 streaming metadata 同步的 defense-in-depth。
      // 闪烁网关由 historyLoading 承担(ChatView 显示「正在加载…」)。
      setMessages([]);
    }
    setBackendSessionId(backendIdNum);

    // cs-round-064:跳过 fetch /history(治本 — history #2 不该被调)
    //   条件:useChat 在流(status='submitted'/'streaming')
    //       + prev 是 null(draft)或负数 tempId(createSession 同步路径留下的中间态)
    //   意义:新建会话 sendMessage 进行中,本地 useChat 已经在流式填 user msg +
    //     assistant placeholder。fetch /history 会拉回 DB 的 status=2 placeholder
    //     (id=DB id)与本地 placeholder (id=client id)是两条 msg → useAutoResumeStreaming
    //     误触发续推(POST /api/chat 第二遍,叫 chat #2)。
    //   切会话 / 刷新场景 status='ready' 或 'error' → 不进此分支,正常 fetch。
    if (
      (chatStatusRef.current === 'submitted' || chatStatusRef.current === 'streaming') &&
      (prevActiveIdBeforeUpdate === null ||
        (typeof prevActiveIdBeforeUpdate === 'string' &&
          /^-/.test(prevActiveIdBeforeUpdate)))
    ) {
      return;
    }

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
          // 但**保留**本地已经在 streaming 的消息:useChat 内部 pushMessage 进去的
          // user / 部分 assistant chunks 是网络竞速产物,清掉 = 截图 9/10 bug 复发。
          // 仅当本地也空(draft / 全新会话)时才清。
          setMessages((prev) => (prev.length === 0 ? [] : prev));
          return;
        }
        setMessages((prev) => {
          const localIds = new Set(prev.map((m) => String(m.id)));
          // cs-round-057:兜底二次去重 — 按 content + role + 短时间窗口(10s)。
          //   解决 cs-round-056 引入的「点 1 次发送 → UI 显示 2 条 user msg」bug。
          //   根因:useChat sendMessage 内部 push 的 user msg id 是 client 生成的
          //   (如 "client-abc"),与 DB cs_message 自增 id(如 69)不同 → 旧逻辑
          //   只看 localIds.has(String(m.id)) 永远不去重 → push 2 条相同 user msg。
          //   兜底:同 content + role + 时间窗口(10s 内)的视为同一条;超过 10s
          //   视为不同会话的不同消息,不去重(防用户两次发相同问题误杀)。
          const SHORT_DEDUP_WINDOW_MS = 10_000;
          const getTextOf = (m: { content?: unknown; parts?: unknown }): string => {
            if (typeof m.content === 'string') return m.content;
            const parts = Array.isArray(m.parts) ? m.parts : [];
            for (const p of parts) {
              const pt = (p as { type?: unknown; text?: unknown }).type;
              const tx = (p as { text?: unknown }).text;
              if (pt === 'text' && typeof tx === 'string') return tx;
            }
            return '';
          };
          const getTsOf = (m: { createdAt?: unknown }): number => {
            // m.createdAt 是 ISO string;AI SDK UIMessage 通常没 createdAt,
            // 这里 fallback m.content 比较时仅在两边都有 createdAt 时才比对窗口。
            if (typeof m.createdAt === 'string') {
              const t = Date.parse(m.createdAt);
              if (!Number.isNaN(t)) return t;
            }
            return Number.NaN;
          };
          const now = Date.now();
          const newFromBackend = restored.filter((m) => {
            // 主去重:按 id(精准,处理正常路径:client id === DB id)
            if (localIds.has(String(m.id))) return false;
            // 兜底:按 content + role + 短窗口(覆盖 cs-round-056 竞态)
            const backendText = getTextOf(m as { content?: string; parts?: unknown });
            const backendRole = m.role;
            const backendTs = getTsOf(m as { createdAt?: unknown });
            for (const p of prev) {
              if (p.role !== backendRole) continue;
              const prevText = getTextOf(p as unknown as { content?: string; parts?: unknown });
              if (prevText !== backendText) continue;
              // content 一致 → 检查时间窗口(短窗口内才算重复)
              const prevTs = getTsOf(p as unknown as { createdAt?: unknown });
              if (!Number.isNaN(prevTs) && !Number.isNaN(backendTs)) {
                if (Math.abs(prevTs - backendTs) > SHORT_DEDUP_WINDOW_MS) continue;
              } else {
                // 缺 createdAt(AI SDK UIMessage 默认无)→ 用 now 兜底窗口:
                // 10s 内视为重复;超过 10s 视为不重复
                // prev 是刚 push 的(几秒前),backend 是刚拉的(几秒前),
                // 两条都在 10s 内 → 视为重复
                if (!Number.isNaN(backendTs) && now - backendTs > SHORT_DEDUP_WINDOW_MS) {
                  continue;
                }
              }
              return false; // 重复
            }
            return true; // 不重复
          });
          if (newFromBackend.length === 0) {
            // 后端消息已全部在本地(常见:刚刚 streaming 的 chunk 已经写到 state,
            // /history 拿到的是 streaming 期间的快照)→ 不覆盖,保留 prev(可能比
            // restored 更完整 — restored 是 GET 时点的快照,prev 是持续累加的 live)。
            return prev;
          }
          return [...prev, ...newFromBackend];
        });
      } catch (e) {
        console.warn('[use-chat-state] load history failed:', (e as Error).message);
      } finally {
        if (!cancelled) {
          // 标记完成 + 清 in-flight;切会话 effect 会整体清这两个 ref
          inFlightSessionIdRef.current = null;
          fetchedSessionIdsRef.current.add(activeId);
          setHistoryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      // 注意:不在 cleanup 里清 inFlightSessionIdRef —
      // StrictMode 同 activeId 重跑时,cleanup 后 effect 重跑,需要 in-flight 仍标记
      // 才能拦住第二次 fetch(否则两边都打到 /history)
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
