'use client';

import { useState, useRef, useEffect, useMemo, FormEvent } from 'react';
import { useChatWithErrors } from '@/hooks/use-chat-with-errors';
import { useSessions } from '@/hooks/use-sessions';
import { useChatState } from '@/hooks/use-chat-state';
import { useRealtime, useRealtimeDisconnectOnUnmount } from '@/hooks/use-realtime';
import { getVisitorId } from '@/lib/visitor';
import { getClientUserId, getClientCustomerId, logoutRequest } from '@/lib/auth';
import { scanStreamError } from '@/lib/stream-error-scanner';
import { refetchSessionHistory } from '@/lib/refetch-history';
import { shouldCreateNewSession, findReusableEmptySession } from '@/lib/session-policy';
import type { UserFacingError, UserFacingErrorActionType } from '@/lib/errors';
import { SessionList } from '@/components/SessionList';
import { MoreMenu } from '@/components/MoreMenu';
import { AuthGuard } from '@/components/AuthGuard';
import { ErrorBubble } from '@/components/ErrorBubble';
import { ChatView } from '@/components/chat/ChatView';
import type { OperatorReplyPayload } from '@/lib/realtime-client';

function getInitialTopK(): number {
  const raw = process.env.NEXT_PUBLIC_TOP_K;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 50) return n;
  return 3;
}
function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function RAGChat() {
  const [topK] = useState<number>(() => getInitialTopK());
  const { messages, sendMessage, stop, status, userError, regenerate, setMessages } =
    useChatWithErrors();
  const [input, setInput] = useState('');
  const isLoading = status === 'submitted' || status === 'streaming';

  const {
    sessions,
    activeId,
    activeSession,
    hydrated: sessionsReady,
    createSession,
    deleteSession,
    renameSession,
    switchSession,
    updateActiveSession,
  } = useSessions();
  const {
    abortedIds,
    setAbortedIds,
    escalationMap,
    setEscalationMap,
    backendSessionId,
    justLoadedRef,
  } = useChatState({ activeId, setMessages });

  const sessionHasOperator = useMemo(
    () =>
      messages.some(
        (m) => (m as unknown as { metadata?: { source?: string } }).metadata?.source === 'operator',
      ),
    [messages],
  );
  const [streamError, setStreamError] = useState<UserFacingError | null>(null);
  // W11:删会话失败单独展示(不动 streamError — 那是流式/AI 错误)
  const [deleteError, setDeleteError] = useState<UserFacingError | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [kbReady, setKbReady] = useState(false);
  const visitorIdRef = useRef<string | null>(null);
  if (visitorIdRef.current === null) visitorIdRef.current = getVisitorId();

  const prevActiveIdRef = useRef<string | null | undefined>(undefined);
  // W11:三支处理 — initial mount(只记 prev)、activeId → null(清 messages,避免删光会话残留)、
  // activeId 切换(加载目标会话 messages)
  useEffect(() => {
    if (prevActiveIdRef.current === undefined) {
      prevActiveIdRef.current = activeId;
      if (activeId === null) return;
      const target = sessions.find((s) => s.id === activeId);
      if (target && target.messages.length > 0) {
        justLoadedRef.current = true;
        setMessages(target.messages);
      }
      return;
    }
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;
    // activeId 从非空 → null(全删了):清 messages,避免残留上一个会话
    if (activeId === null) {
      setMessages([]);
      justLoadedRef.current = true;
      return;
    }
    const target = sessions.find((s) => s.id === activeId);
    justLoadedRef.current = true;
    setMessages(target?.messages ?? []);
  }, [activeId, sessions, setMessages, justLoadedRef]);

  useEffect(() => {
    if (!activeId) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }
    updateActiveSession(messages, visitorIdRef.current ?? 'anon');
  }, [messages, activeId, updateActiveSession, justLoadedRef]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastPartsSnapshotRef = useRef('');
  useEffect(() => {
    const last = messages[messages.length - 1] as unknown as { parts?: unknown[] } | undefined;
    const snap = JSON.stringify(last?.parts ?? []);
    if (snap === lastPartsSnapshotRef.current) return;
    lastPartsSnapshotRef.current = snap;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同步 messages/status → derived streamError(imperative reset 由 handleErrorAction 单独维护) */
  useEffect(() => {
    // AI SDK 6.x scanStreamError 入参是 StreamMessage[],而 messages 是 UIMessage[];
    // 两者 shape 兼容(messages 是 StreamMessage 的 superset),这里显式 cast 让 TS 安静。
    setStreamError(scanStreamError(messages as unknown as Parameters<typeof scanStreamError>[0], status));
  }, [messages, status]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch('/api/store-info')
      .then((r) => r.json())
      .catch(() => null)
      .finally(() => setKbReady(true));
  }, []);

  const refetchHistoryRef = useRef<((sid: number) => Promise<void>) | undefined>(undefined);
  const pendingRefetchRef = useRef(false);
  useEffect(() => {
    refetchHistoryRef.current = async (sid: number) => {
      try {
        const restored = await refetchSessionHistory(sid);
        if (restored.length === 0) return;
        justLoadedRef.current = true;
        setMessages(restored);
      } catch (e) {
        console.warn('[page] ws refetch failed:', (e as Error).message);
      }
    };
  }, [setMessages, justLoadedRef]);

  // W11:stable ref 让 getKnownMessageIds 不随 messages 变化触发 effect 重连
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useRealtime({
    sessionKey: activeId,
    enabled: backendSessionId != null,
    onMessage: (payload: OperatorReplyPayload) => {
      if (!payload || payload.sessionId !== backendSessionId) return;
      if (status === 'submitted' || status === 'streaming') {
        pendingRefetchRef.current = true;
        return;
      }
      refetchHistoryRef.current?.(backendSessionId);
    },
    backendSessionId,
    onRecover: (recovered) => {
      if (recovered.length === 0) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const filtered = recovered.filter((m) => !seen.has(m.id));
        return [...prev, ...filtered];
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

  function handleStop() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (last) setAbortedIds((prev) => new Set(prev).add(last.id));
    stop();
  }
  function handleSwitchSession(id: string) {
    if (id !== activeId) {
      stop();
      switchSession(id);
    }
  }
  function handleCreateSession() {
    stop();
    // 0) reuse:sidebar 里如果有别的空会话,直接跳过去,避免每点 + 都累积空壳
    //    业界惯例(ChatGPT / Claude.ai):点 + 在空 shell 上是 no-op
    const empty = findReusableEmptySession(sessions, activeId);
    if (empty) {
      if (empty.id !== activeId) switchSession(empty.id);
      return;
    }
    // 当前 active 已经是空会话 → 别再造壳(no-op),避免 sidebar 被空壳污染
    // (用户连点 "+ 新会话" / 误触 / 双击 等场景)
    // 用 activeSession.messages 而不是 useChat.messages — 后者在 activeId 切换后
    // 有 1-2 帧才被清空,期间会误判为「有内容」连续建壳
    if (!shouldCreateNewSession(activeId, activeSession?.messages ?? [])) return;
    createSession();
  }
  function handleDeleteSession(id: string) {
    stop();
    // W11:删除是 async + 后端调用,失败时用 ErrorBubble 兜底
    deleteSession(id).catch((e: unknown) => {
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
    renameSession(id, title);
  }
  function handleErrorAction(type: UserFacingErrorActionType) {
    if (type === 'retry') regenerate();
    else if (type === 'reset') setMessages([]);
    else if (type === 'reload') window.location.reload();
    else if (type === 'escalate') {
      console.log('[page] escalate');
      setStreamError(null);
    }
    // 'reset' 还可能是 deleteError 的"知道了"按钮 — 一并清
    if (type === 'reset') setDeleteError(null);
  }
  function send(text: string) {
    setStreamError(null);
    // V1 S5:把登录用户的 userId 注入到 chat body,后端 upsertSession 时落到 cs_session.userId
    // (visitorId 继续保留,作为匿名兜底;两者并存 — 已登录用 userId,未登录只用 visitorId)
    // W11:对 C 端登录用户,userId 实际是 CsCustomer.id — 同时塞 customerId 给后端分流,
    // listOrdersBySession 看到 customerId 非空就改走 Order.customer_id 过滤。
    const userId = getClientUserId();
    const customerId = getClientCustomerId();
    // W11:0 会话空态下(activeId=null)发消息 → 先 createSession 拿真 sessionKey,
    // 让侧栏出现这个会话 + 与后端 cs_session.sessionKey 对齐(原 anon-${Date.now()} 是孤儿后端用完即弃)
    let currentActiveId = activeId;
    if (!currentActiveId) {
      currentActiveId = createSession();
    }
    sendMessage(
      { text },
      {
        body: {
          topK,
          sessionKey: currentActiveId,
          visitorId: visitorIdRef.current ?? 'anon',
          userId,
          customerId,
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
        {/* W11:删除失败提示 — 放在 sidebar 下方,跟随 sidebar 一起被推下去。
            不阻塞列表滚动,不与 streamError 冲突。 */}
        {deleteError && (
          <div className="px-3 pb-3">
            <ErrorBubble error={deleteError} onAction={handleErrorAction} />
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
            {/* V11 fix:加 logout 入口 — JWT 过期或主动换号场景 */}
            <button
              type="button"
              onClick={async () => {
                try {
                  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
                  await logoutRequest(apiBase);
                } catch {
                  // 即便 logout 接口失败,也清本地 cookie + 跳 login
                }
                if (typeof document !== 'undefined') {
                  // 双保险:清前端缓存的 v1_user_info
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
          sessionsReady={sessionsReady}
          userError={userError}
          streamError={streamError}
          abortedIds={abortedIds}
          escalationMap={escalationMap}
          sessionHasOperator={sessionHasOperator}
          activeId={activeId}
          debugTrace={debugTrace}
          debugRetrieval={debugRetrieval}
          messagesEndRef={messagesEndRef}
          formatTime={formatTime}
          onChangeInput={setInput}
          onSubmit={onSubmit}
          onStop={handleStop}
          onQuickQuestion={handleQuickQuestion}
          onRetry={(id) => {
            // AI SDK 6.x regenerate 返回 Promise<void>,内部失败会 unhandled rejection
            // 触发 Next.js dev 错误覆盖层("未知错误" 框)。
            // 用无参 regenerate() 让 useChat 自动选最后一条 assistant(避免 messageId
            // 格式不匹配),加 try/catch 兜底防止覆盖层出现。
            regenerate().catch((e) => console.error('[onRetry] regenerate failed:', e));
            void id; // 保留签名(后续可按 id 选具体 message)
          }}
          onErrorAction={handleErrorAction}
          setEscalationMap={setEscalationMap}
        />
      </div>
    </div>
  );
}

/**
 * V1 S5:把主对话页包到 AuthGuard 里 — 未登录自动跳 /login。
 * 包装方式:在 default export 处包,不污染内层组件(还能用 hooks)。
 */
export default function Page() {
  return (
    <AuthGuard>
      <RAGChat />
    </AuthGuard>
  );
}
