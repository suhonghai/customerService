'use client';

import { useState, useRef, useEffect, useMemo, FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useChatWithErrors } from '@/hooks/use-chat-with-errors';
import { useSessions, deriveTitleFromMessage } from '@/hooks/use-sessions';
import { useChatState } from '@/hooks/use-chat-state';
import { useRealtime, useRealtimeDisconnectOnUnmount } from '@/hooks/use-realtime';
import { useAutoResumeStreaming } from '@/hooks/use-auto-resume-streaming';
import { getVisitorId } from '@/lib/visitor';
import { getClientUserId, getClientCustomerId } from '@/lib/auth';
import { getErpAdminClient } from '@/lib/erp-admin-client';
import { scanStreamError } from '@/lib/stream-error-scanner';
import { refetchSessionHistory } from '@/lib/refetch-history';
import { withCache } from '@/lib/with-cache';
import { dedupeMessagesByContent } from '@/lib/dedupe-messages';
import type { UserFacingError, UserFacingErrorActionType } from '@/lib/errors';
import { SessionList } from '@/components/SessionList';
import { MoreMenu } from '@/components/MoreMenu';
import { ErrorBubble } from '@/components/ErrorBubble';
import { ChatView } from '@/components/chat/ChatView';
import type { OperatorReplyPayload } from '@/lib/realtime-client';
import { onTicketClosed, onTicketCreated } from '@/lib/realtime-client';

/**
 * 拉 KB / store 元信息(mount 时 1 次)。
 * withCache 包住 — 防 React Strict Mode dev 双调用 effect + HMR 多次 mount 重复请求。
 * 失败 reset(下次可重试)。
 */
const getStoreInfo = withCache(() =>
  fetch('/api/store-info')
    .then((r) => r.json())
    .catch(() => null),
);

function getInitialTopK(): number {
  const raw = process.env.NEXT_PUBLIC_TOP_K;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
  return 3;
}
function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * RAGChat(纯后端驱动版)
 *
 * cs-round-013:**不再依赖 localStorage** 加载任何聊天数据。
 * - sessions 列表来自 `/api/customer/sessions/list`(useSessions 拉)
 * - activeId 来自 URL `/chat/[sessionId]`(useParams)
 * - 单会话 messages 由 useChatState 调 `/api/sessions/:id/history` 拉(diff/append)
 * - 切 session 闪烁 → fetch /history 期间用 `historyLoading` state 在 ChatView 显示「正在加载」
 *
 * 路由 ↔ activeId 同步仍保留(URL 是 activeId 的真相源)。
 */
export function RAGChat() {
  const [topK] = useState<number>(() => getInitialTopK());
  const { messages, sendMessage, stop, status, userError, regenerate, setMessages } =
    useChatWithErrors();
  const [input, setInput] = useState('');
  const isLoading = status === 'submitted' || status === 'streaming';

  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const urlSessionId = params?.sessionId ?? null;

  const {
    sessions,
    activeId,
    activeSession,
    hydrated: sessionsReady,
    createSession,
    enterDraft,
    deleteSession,
    renameSession,
    switchSession,
    updateActiveSession,
  } = useSessions();

  // URL ↔ activeId 同步(URL 是真相源)
  const prevUrlSessionIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevUrlSessionIdRef.current === undefined) {
      prevUrlSessionIdRef.current = urlSessionId ?? null;
      if (urlSessionId && urlSessionId !== activeId) {
        switchSession(urlSessionId);
      }
      return;
    }
    if (prevUrlSessionIdRef.current === urlSessionId) return;
    prevUrlSessionIdRef.current = urlSessionId ?? null;
    if (urlSessionId && urlSessionId !== activeId) {
      switchSession(urlSessionId);
    }
  }, [urlSessionId, activeId, switchSession]);

  // cs-round-043:把当前 active session 的 backend id 写到 window,让 RatingButtons
  //   不经 prop drilling 就能拿到(否则要把 sessionId 从 RAGChat 一路透传到 ChatView
  //   → MessageBubble → RatingButtons,改 3 个文件,本方法最小侵入)。
  //   activeSession?.id 是 backend csSession.id(整数,前端 messageId = String(csMessage.id))。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as unknown as { __csActiveSessionId?: number };
    w.__csActiveSessionId =
      activeSession && activeSession.id > 0 ? activeSession.id : undefined;
  }, [activeSession]);

  // cs-round-013:切 session 闪烁网关改为 `historyLoading` state
  const [historyLoading, setHistoryLoading] = useState(false);

  const { abortedIds, setAbortedIds, escalationMap, setEscalationMap, backendSessionId } =
    useChatState({ activeId, setMessages, setHistoryLoading });

  // cs-round-036 UX 修正:判断"工单 OPEN 状态"用 ticket 真实状态,不再用 messages.operator 推断
  // (旧判断 bug:工单 OPEN 但客服从未回复时 banner 不显示;关单后 banner 仍显示)
  const [sessionHasOpenTicket, setSessionHasOpenTicket] = useState(false);

  // backendSessionId 变化时 → 拉 ticket 状态(同时切会话时重新判断)
  useEffect(() => {
    let cancelled = false;
    if (backendSessionId == null) {
      setSessionHasOpenTicket(false);
      return () => {
        cancelled = true;
      };
    }
    void getErpAdminClient()
      .getSessionOpenTicket(backendSessionId)
      .then((t) => {
        if (cancelled) return;
        // t === null → 该 session 没有 OPEN 工单;t !== null → status ∈ {1,2,3} 之一 → OPEN
        setSessionHasOpenTicket(t !== null);
      })
      .catch(() => {
        if (!cancelled) setSessionHasOpenTicket(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backendSessionId]);
  const [streamError, setStreamError] = useState<UserFacingError | null>(null);
  const [deleteError, setDeleteError] = useState<UserFacingError | null>(null);
  // cs-round-042:rename 失败提示(乐观更新已 revert,这里给用户感知)
  const [renameError, setRenameError] = useState<UserFacingError | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kbReady, setKbReady] = useState(false);
  const visitorIdRef = useRef<string | null>(null);
  if (visitorIdRef.current === null) visitorIdRef.current = getVisitorId();

  // messages 变化 → 同步 messageCount + title 到 sessions(draft 跳过)
  useEffect(() => {
    if (!activeId) return;
    updateActiveSession(messages, visitorIdRef.current ?? 'anon');
    // activeId / messages 变化即重跑;updateActiveSession 是 useCallback 稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeId, updateActiveSession]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastPartsSnapshotRef = useRef('');
  useEffect(() => {
    const last = messages[messages.length - 1] as unknown as { parts?: unknown[] } | undefined;
    const snap = JSON.stringify(last?.parts ?? []);
    if (snap === lastPartsSnapshotRef.current) return;
    lastPartsSnapshotRef.current = snap;
    if (status === 'submitted' || status === 'streaming') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, status]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同步 messages/status → derived streamError(imperative reset 由 handleErrorAction 单独维护) */
  useEffect(() => {
    setStreamError(
      scanStreamError(messages as unknown as Parameters<typeof scanStreamError>[0], status),
    );
  }, [messages, status]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    getStoreInfo().finally(() => setKbReady(true));
  }, []);

  const refetchHistoryRef = useRef<((sid: number) => Promise<void>) | undefined>(undefined);
  const pendingRefetchRef = useRef(false);
  // cs-round-021:per-messageId dedupe set(operator_reply 收到过的 messageId,防重放 / 重连风暴)
  const seenOperatorMessageIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    refetchHistoryRef.current = async (sid: number) => {
      try {
        const restored = await refetchSessionHistory(sid);
        if (restored.length === 0) return;
        setMessages(restored);
      } catch (e) {
        console.warn('[page] ws refetch failed:', (e as Error).message);
      }
    };
  }, [setMessages]);

  // cs-round-021:W11 兜底 refetch 死循环堵死 — 记下「已 refetch 过的 (sessionId,
  // lastAssistantId)」对,后续 effect 重跑时同对直接 break。否则 refetch → setMessages
  // → messages 变 → effect 再跑 → 又 refetch,GET /history 风暴。
  const w11RefetchDedupeRef = useRef<Set<string>>(new Set());
  // 切会话(backendSessionId 变)清空 W11 dedupe set,避免无限增长
  useEffect(() => {
    w11RefetchDedupeRef.current.clear();
  }, [backendSessionId]);

  // W11(2026-08-05):stream 完成兜底 — 如果 status 变成 ready/error 但最后一条
  // assistant 还是空(前端 stream chunks 丢失 / 客户端断流),自动 refetch backend history。
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    if (status !== 'ready' && status !== 'error') return;
    if (!backendSessionId) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== 'assistant') continue;
      const text = ((m.parts ?? []) as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('');
      if (!text) {
        // cs-round-021:dedupe 锚 — (sessionId, lastAssistantId) 已 refetch 过则跳过
        const dedupeKey = `${backendSessionId}:${m.id}`;
        if (w11RefetchDedupeRef.current.has(dedupeKey)) {
          break;
        }
        w11RefetchDedupeRef.current.add(dedupeKey);
        refetchHistoryRef.current?.(backendSessionId);
      }
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, backendSessionId, messages]);

  useRealtime({
    // cs-round-015:sessionKey 必须是**真 sessionKey**(后端 WS 网关按 string unique
    // 查 csSession),不是后端数字主键 activeId(那是 backendId / tempId,DB 里查不到
    // → "unknown sessionKey=221, disconnect" 风暴)。
    // activeSession?.sessionKey 在 createSession 同步路径已写入,upsert 完成后浅拷贝
    // 保留,sessionKey 全程不变 → useRealtime effect 不重连 ✓
    sessionKey: activeSession?.sessionKey ?? null,
    enabled: backendSessionId != null,
    onMessage: (payload: OperatorReplyPayload) => {
      if (!payload || payload.sessionId !== backendSessionId) return;
      // cs-round-021:per-messageId dedupe — socket.io state recovery / 重连风暴可能
      // 同一个 messageId 触发多次 onMessage;refetch 一次足够,后续同 messageId 跳过
      if (seenOperatorMessageIdsRef.current.has(payload.messageId)) return;
      seenOperatorMessageIdsRef.current.add(payload.messageId);
      if (status === 'submitted' || status === 'streaming') {
        pendingRefetchRef.current = true;
        return;
      }
      refetchHistoryRef.current?.(backendSessionId);
    },
    backendSessionId,
    onRecover: (recovered) => {
      if (recovered.length === 0) return;
      if (status === 'submitted' || status === 'streaming') {
        pendingRefetchRef.current = true;
        return;
      }
      setMessages((prev) => {
        return dedupeMessagesByContent([...prev, ...recovered]);
      });
    },
    getKnownMessageIds: () => new Set(messagesRef.current.map((m) => m.id)),
  });

  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') return;
    if (!pendingRefetchRef.current) return;
    pendingRefetchRef.current = false;
    if (backendSessionId != null) refetchHistoryRef.current?.(backendSessionId);
  }, [status, backendSessionId]);
  useRealtimeDisconnectOnUnmount();

  // cs-round-036:订阅 WS ticket_closed — 收到后立即同步 sessionHasOpenTicket=false
  // (banner + 结束对话按钮消失,但输入框保留 — 用户关单后还能继续跟 AI 对话 / 重新召唤人工)
  useEffect(() => {
    const off = onTicketClosed((payload) => {
      if (payload.closedBy === 'user') {
        setInput('');
      }
      // 不管 closedBy 是 user 还是 operator,本会话的 OPEN 工单都已 closed
      setSessionHasOpenTicket(false);
    });
    return off;
  }, []);

  // cs-round-037:订阅 WS ticket_created — 防 RAGChat mount 时 ticket 还没创建
  // → useEffect 拉 getSessionOpenTicket 返回 null → 永远 false,banner 永不显示
  // 收到后立即 setSessionHasOpenTicket(true) 显示 banner
  useEffect(() => {
    const off = onTicketCreated(() => {
      setSessionHasOpenTicket(true);
    });
    return off;
  }, []);

  // cs-round-011:自动续推
  useAutoResumeStreaming({
    messages,
    setMessages: (updater) => setMessages(updater),
    // cs-round-015:同 useRealtime,真 sessionKey 走 activeSession.sessionKey
    // (activeId 是后端数字主键,POST /api/chat 内部 upsertSession 会拿这个当新 sessionKey,
    //  → 续推期间若 activeId 是 tempId / backendId 会污染后端 session 表)。
    sessionKey: activeSession?.sessionKey ?? null,
    visitorId: visitorIdRef.current ?? 'anon',
    userId: getClientUserId(),
    customerId: getClientCustomerId(),
    topK,
  });

  function handleStop() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (last) setAbortedIds((prev) => new Set(prev).add(last.id));
    stop();
  }
  function send(text: string) {
    setStreamError(null);
    const userId = getClientUserId();
    const customerId = getClientCustomerId();
    // cs-round-013:draft 态(activeId=null)发首条消息 → 同步创建 session 占位,
    // 立刻 sendMessage。后端 upsert 异步进行,backendId 异步到位后 sidebar 自动更新。
    let currentActiveId = activeId;
    let currentSessionKey: string | null = activeSession?.sessionKey ?? null;
    // cs-round-056:仅新建会话时,透传 firstUserMessage 到 sendMessage body,
    // 让 chat route 看到后跳过自己的 appendMessage(user)(防 upsert + chat 双写)。
    // 多轮对话(2nd/3rd)createSession 不触发,这里 firstUserMessage 留空 → chat route 正常写。
    let firstUserMessage: string | undefined;
    let firstUserMessageParts: unknown[] | undefined;
    if (!currentActiveId) {
      const userMsg = { role: 'user' as const, parts: [{ type: 'text' as const, text }] };
      const title = deriveTitleFromMessage(
        userMsg as unknown as Parameters<typeof deriveTitleFromMessage>[0],
      );
      // 同步:createSession 立即 setActiveId(tempId) + 立即返回 sessionKey
      // cs-round-015:onCommit 在 upsert 拿到真 backendId 时触发 → router.replace
      // 把 URL 从 tempId 切到 backendId(URL 是 activeId 真相源,不能停在 tempId)。
      // cs-round-056:userMessage.text + userMessage.parts 透传给 createSession,
      // 由 createSession 发 upsert 时落 cs_message(role=user, status=1)+ messageCount +1。
      const { sessionKey, tempId } = createSession({
        title,
        userMessage: { text, parts: userMsg.parts },
        onCommit: (backendId) => router.replace(`/chat/${backendId}`),
      });
      currentActiveId = String(tempId);
      currentSessionKey = sessionKey;
      router.replace(`/chat/${tempId}`);
      // cs-round-056:把首条消息标记带到 sendMessage body,chat route 据此跳过 appendMessage
      firstUserMessage = text;
      firstUserMessageParts = userMsg.parts;
    }
    sendMessage(
      { text },
      {
        body: {
          topK,
          sessionKey: currentSessionKey ?? currentActiveId,
          visitorId: visitorIdRef.current ?? 'anon',
          userId,
          customerId,
          // cs-round-056:仅首条消息时设,chat route 看到即跳过自己写 user msg
          firstUserMessage,
          firstUserMessageParts,
        },
      },
    );
  }
  function onSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    send(text);
  }
  function handleQuickQuestion(q: string) {
    if (isLoading) return;
    setInput('');
    send(q);
  }
  function handleSwitchSession(id: string) {
    if (id !== activeId) {
      stop();
      switchSession(id);
      router.replace(`/chat/${id}`);
    }
  }
  function handleCreateSession() {
    stop();
    enterDraft();
    router.replace('/');
  }
  function handleDeleteSession(id: string) {
    stop();
    // cs-round-018:删的是 active 会话时,先清 messages(useChat 内部 state)。
    // 否则 useSessions.deleteSession 内部 setActiveId(next) 触发 useChatState effect
    // fetch 新会话 /history → diff/append 时,prev 还是已删会话的消息 → 右框残留。
    // 删非 active 不动 messages(activeId 不变,useChatState effect 不跑)。
    if (id === activeId) {
      setMessages([]);
    }
    deleteSession(id)
      .then(() => {
        if (id === activeId) router.replace('/');
      })
      .catch((e: unknown) => {
        const raw = e instanceof Error ? e : new Error(String(e));
        setDeleteError({
          title: '删除会话失败',
          hint: '后端没响应或鉴权失败,会话已保留在列表里。重试一次,或刷新页面后再删。',
          action: { label: '知道了', type: 'reset' },
          raw,
        });
      });
  }
  function handleRenameSession(id: string, title: string) {
    // cs-round-042:async + 失败 ErrorBubble(use-sessions 内部已乐观更新 + revert)
    renameSession(id, title).catch((e: unknown) => {
      const raw = e instanceof Error ? e : new Error(String(e));
      setRenameError({
        title: '重命名失败',
        hint: '后端没响应或鉴权失败,标题已回滚到原值。重试一次,或刷新页面后再改。',
        action: { label: '知道了', type: 'reset' },
        raw,
      });
    });
  }
  function handleErrorAction(type: UserFacingErrorActionType) {
    if (type === 'retry') regenerate();
    else if (type === 'reset') setMessages([]);
    else if (type === 'reload') window.location.reload();
    else if (type === 'escalate') {
      console.log('[page] escalate');
      setStreamError(null);
    }
    if (type === 'reset') setDeleteError(null);
    if (type === 'reset') setRenameError(null);
  }
  const debugTrace = process.env.NEXT_PUBLIC_DEBUG_TRACE === 'true';
  const debugRetrieval = process.env.NEXT_PUBLIC_DEBUG_RETRIEVAL === 'true';

  return (
    <div className="flex h-screen" style={{ background: 'var(--surface)' }}>
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-30 w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 md:w-64 md:flex-shrink-0 ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SessionList
          sessions={sessions}
          activeId={activeId}
          onSwitch={(id) => {
            handleSwitchSession(id);
            setMobileSidebarOpen(false);
          }}
          onCreate={() => {
            handleCreateSession();
            setMobileSidebarOpen(false);
          }}
          onDelete={handleDeleteSession}
          onRename={handleRenameSession}
        />
        {deleteError && (
          <div className="px-3 pb-3">
            <ErrorBubble error={deleteError} onAction={handleErrorAction} />
          </div>
        )}
        {/* cs-round-042:rename 失败 ErrorBubble */}
        {renameError && (
          <div className="px-3 pb-3">
            <ErrorBubble error={renameError} onAction={handleErrorAction} />
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col w-full relative z-10">
        <header
          className="flex items-center justify-between gap-3 px-4 md:px-6 py-4 border-b backdrop-blur-sm"
          style={{
            background:
              'linear-gradient(to bottom, var(--brand-primary-soft) 0%, transparent 100%)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden rounded-xl text-white p-2.5 shadow-sm transition-all active:scale-95"
              style={{ background: 'var(--brand-primary)' }}
              aria-label="打开会话列表"
            >
              <span className="text-base leading-none">☰</span>
            </button>
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-2xl text-lg shadow-sm"
              style={{
                background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)',
              }}
            >
              🛍️
            </span>
            <div className="min-w-0">
              <h1 className="display font-bold text-lg md:text-xl leading-tight truncate">
                小服客服
              </h1>
              <div
                className="text-[11px] md:text-xs truncate hidden md:block"
                style={{ color: 'var(--text-tertiary)' }}
              >
                智能购物助手
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: 'var(--success)' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>在线 · 9:00-22:00</span>
            </div>
            {activeSession && <MoreMenu session={activeSession} escalationMap={escalationMap} />}
            <button
              type="button"
              onClick={async () => {
                try {
                  // [cs-round-049] 改走 BFF /api/cs/auth/logout,
                  // 绕开 chat.suhhai.cn → api.suhhai.cn 跨域 POST 写 Set-Cookie
                  // 被 SameSite=Lax 拒收的 bug。
                  await fetch('/api/cs/auth/logout', { method: 'POST', credentials: 'include' });
                } catch {
                  // 即便 BFF 失败,也清本地 cookie + 跳 login
                }
                if (typeof document !== 'undefined') {
                  document.cookie = 'v1_user_info=; Max-Age=0; path=/';
                }
                window.location.href = '/login';
              }}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-elevated)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="退出登录"
            >
              退出登录
            </button>
          </div>
        </header>
        <ChatView
          messages={messages}
          status={status}
          input={input}
          isLoading={isLoading}
          kbReady={kbReady}
          sessionsReady={sessionsReady && !historyLoading}
          userError={userError}
          streamError={streamError}
          abortedIds={abortedIds}
          escalationMap={escalationMap}
          sessionHasOpenTicket={sessionHasOpenTicket}
          activeId={activeId}
          activeSessionKey={activeSession?.sessionKey ?? null}
          debugTrace={debugTrace}
          debugRetrieval={debugRetrieval}
          messagesEndRef={messagesEndRef}
          formatTime={formatTime}
          onChangeInput={setInput}
          onSubmit={onSubmit}
          onStop={handleStop}
          onQuickQuestion={handleQuickQuestion}
          onRetry={(id) => {
            regenerate().catch((e) => console.error('[onRetry] regenerate failed:', e));
            void id;
          }}
          onErrorAction={handleErrorAction}
          setEscalationMap={setEscalationMap}
        />
      </div>
    </div>
  );
}
