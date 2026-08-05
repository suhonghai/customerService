'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useChatWithErrors } from '@/hooks/use-chat-with-errors';
import { useSessions, deriveTitleFromMessage } from '@/hooks/use-sessions';
import { useChatState } from '@/hooks/use-chat-state';
import { useRealtime, useRealtimeDisconnectOnUnmount } from '@/hooks/use-realtime';
import { useAutoResumeStreaming } from '@/hooks/use-auto-resume-streaming';
import { getVisitorId } from '@/lib/visitor';
import { getClientUserId, getClientCustomerId, logoutRequest } from '@/lib/auth';
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

// ── 2026-08-04 路由 ↔ activeId 同步 ──
// Next.js App Router URL 形如 /chat/[sessionId]。RAGChat 内部:
//   - useParams() 读 URL sessionId → useEffect 调 switchSession(sessionId) → setActiveId
//   - handleSwitchSession / handleCreateSession / handleDeleteSession 调 router.replace 同步 URL
//   - 刷新页面:useParams 仍能拿到 sessionId,useEffect 跑 switchSession → 跳回目标会话
//   - 在 /chat/[sessionId]/page.tsx 和 app/page.tsx 都 import 此组件复用
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
  // ── 2026-08-05 路由 ↔ activeId 同步(修复切 session 闪烁) ──
  // useParams 读 urlSessionId,useEffect 监听 urlSessionId 变化 → 调 switchSession
  // 关键:只在 urlSessionId 真变化时触发(activeId 单独变时不触发)。
  //
  // 旧 bug:点 sidebar → switchSession(B) → setActiveId(B) → router.replace(/chat/B)
  //  setActiveId 在 router.replace 完成 URL 改变之前先 batched 渲染一次
  //  → 此时 activeId=B 但 urlSessionId 还是旧值 → URL sync effect 误判 mismatch
  //  → switchSession(旧值) → setActiveId(回旧) → 再切回去 → 闪烁 A→B→A→B。
  //
  // 修法:用 prevUrlSessionIdRef 记录上次 urlSessionId,只在它变化时同步。
  // 初始 mount 也支持 deep link 同步(用本地 ref 而不是 deps 检测)。
  // 顺序:必须在 useSessions 解构之后(引用 activeId/switchSession)
  const prevUrlSessionIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (prevUrlSessionIdRef.current === undefined) {
      prevUrlSessionIdRef.current = urlSessionId ?? null;
      // 初始 mount:如果 URL 和 activeId 不一致(深链场景),sync 到 URL
      if (urlSessionId && urlSessionId !== activeId) {
        switchSession(urlSessionId);
      }
      return;
    }
    if (prevUrlSessionIdRef.current === urlSessionId) return;
    prevUrlSessionIdRef.current = urlSessionId ?? null;
    // urlSessionId 真变化(浏览器前进后退 / 直接改 URL)→ sync 到 URL
    if (urlSessionId && urlSessionId !== activeId) {
      switchSession(urlSessionId);
    }
  }, [urlSessionId, activeId, switchSession]);

  // W11:切 session 闪烁网关(2026-08-04):
  // RAGChat 在 useLayoutEffect 同步从 localStorage 加载消息、置此 ref=true;
  // useChatState 的 useEffect 读 ref 后跳过 /history fetch,消除
  // "B.local → B.backend"两次 setMessages 的 race flicker。
  const loadedFromLocalRef = useRef(false);

  const {
    abortedIds,
    setAbortedIds,
    escalationMap,
    setEscalationMap,
    backendSessionId,
  } = useChatState({ activeId, loadedFromLocalRef, setMessages });

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
  // W11:justLoadedRef 标记刚同步过 messages — 下一帧 write-back effect 跳过,
  // 避免把刚 load 的本地消息当作用户输入又写回 sessions(无谓 setSessions)
  const justLoadedRef = useRef(false);
  // W11:三支处理 — initial mount(只记 prev)、activeId → null(清 messages,避免删光会话残留)、
  // activeId 切换(加载目标会话 messages)
  // 2026-08-04 升级 useEffect → useLayoutEffect:activeId 变化时,setMessages 在 paint 前
  // 完成,浏览器只 paint 最终的 B.messages,不会先 paint 旧的 A.messages 再 paint B.messages
  // (消除切 session 闪烁第 1 次 — A→B 内容切换瞬时可见)。
  // 同时维护 loadedFromLocalRef 网关,告诉 useChatState 是否跳过 /history fetch。
  useLayoutEffect(() => {
    if (prevActiveIdRef.current === undefined) {
      prevActiveIdRef.current = activeId;
      if (activeId === null) return;
      const target = sessions.find((s) => s.id === activeId);
      if (target && target.messages.length > 0) {
        // W11:dedupe by content — 历史 localStorage 可能被早期 WS reconnect refetch
        // 污染过(客户端 nanoid id + 后端 numeric id 共存),按 id dedupe 失效。
        // 见 src/lib/dedupe-messages.ts。dedupe 后用纯化版本 setMessages +
        // 主动写回 sessions,清掉污染。
        const deduped = dedupeMessagesByContent(target.messages);
        if (deduped.length !== target.messages.length) {
          // eslint-disable-next-line no-console
          console.warn(
            `[RAGChat] localStorage deduped ${target.messages.length - deduped.length} duplicate messages`,
          );
          // 写回 sessions(useSessions 的 persist effect 会持久化到 localStorage)。
          // 不依赖 RAGChat 的 write-back effect,因为 justLoadedRef=true 会让它跳过。
          updateActiveSession(deduped, visitorIdRef.current ?? 'anon');
        }
        justLoadedRef.current = true;
        setMessages(deduped);
        // 网关:localStorage 有内容 → useChatState 跳过 /history fetch(避免 race)
        loadedFromLocalRef.current = true;
      }
      // target 空(localStorage 无该 session,常见于 backend merge 来的新会话)
      // → loadedFromLocalRef 保持 false,useChatState 会 fetch backend history
      return;
    }
    if (prevActiveIdRef.current === activeId) return;
    prevActiveIdRef.current = activeId;
    // activeId 从非空 → null(全删了):清 messages,避免残留上一个会话
    if (activeId === null) {
      setMessages([]);
      justLoadedRef.current = true;
      loadedFromLocalRef.current = false; // null session 不 fetch
      return;
    }
    const target = sessions.find((s) => s.id === activeId);
    justLoadedRef.current = true;
    // 同样 dedupe(切 session 也可能命中历史污染的 localStorage)
    const deduped = target ? dedupeMessagesByContent(target.messages) : [];
    setMessages(deduped);
    if (target && deduped.length !== target.messages.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[RAGChat] session-switch deduped ${target.messages.length - deduped.length} duplicate messages`,
      );
      updateActiveSession(deduped, visitorIdRef.current ?? 'anon');
    }
    // 网关:local 有消息 → 跳过 fetch;local 空 → 保留 fetch(跨设备同步)
    loadedFromLocalRef.current = deduped.length > 0;
    // justLoadedRef / loadedFromLocalRef 是 ref 不进 deps;updateActiveSession 是 useCallback 稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sessions, setMessages, updateActiveSession]);

  useEffect(() => {
    if (!activeId) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }
    updateActiveSession(messages, visitorIdRef.current ?? 'anon');
    // justLoadedRef 是 ref,不进 deps;activeId / messages 变化即重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeId, updateActiveSession]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastPartsSnapshotRef = useRef('');
  // 切 session 时不自动 scrollIntoView(避免滚动动画在视觉上像"闪烁");
  // 只在 AI 流式生成时 follow scroll。session 切换交给用户手动控制滚动位置。
  useEffect(() => {
    const last = messages[messages.length - 1] as unknown as { parts?: unknown[] } | undefined;
    const snap = JSON.stringify(last?.parts ?? []);
    if (snap === lastPartsSnapshotRef.current) return;
    lastPartsSnapshotRef.current = snap;
    // 仅在 submitted/streaming 状态(send 后 / AI 流式中)→ follow scroll to bottom
    // 其他情况(message 已完成 / 切 session):不自动滚,避免视图跳动
    if (status === 'submitted' || status === 'streaming') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages, status]);

  /* eslint-disable react-hooks/set-state-in-effect -- 同步 messages/status → derived streamError(imperative reset 由 handleErrorAction 单独维护) */
  useEffect(() => {
    // AI SDK 6.x scanStreamError 入参是 StreamMessage[],而 messages 是 UIMessage[];
    // 两者 shape 兼容(messages 是 StreamMessage 的 superset),这里显式 cast 让 TS 安静。
    setStreamError(scanStreamError(messages as unknown as Parameters<typeof scanStreamError>[0], status));
  }, [messages, status]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    getStoreInfo().finally(() => setKbReady(true));
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

  // W11(2026-08-05):stream 完成兜底 — 如果 status 变成 ready/error 但最后一条
  // assistant 还是空(前端 stream chunks 丢失 / 客户端断流),自动 refetch backend history。
  // backend 端的 req.signal 已 detach(commit 6583e1b),即使 client 断开 backend
  // 仍跑完 stream 并 PATCH status=1 + 完整内容 → refetch 能拿到真值。
  useEffect(() => {
    if (status !== 'ready' && status !== 'error') return;
    if (!backendSessionId) return;
    // 仅在最后一条 assistant 为空时触发(避免每次 ready 都 refetch)
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || m.role !== 'assistant') continue;
      const text = ((m.parts ?? []) as Array<{ type?: string; text?: string }>)
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('');
      if (!text) {
        refetchHistoryRef.current?.(backendSessionId);
      }
      break; // 只看最后一条 assistant
    }
    // status/backendSessionId/messages 任一变化即重跑;refetchHistoryRef 是稳定 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, backendSessionId, messages]);

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
      // W11:流式期间不要 refetch-append — 客户端 AI SDK 正在 streaming 的 assistant
      // 与后端刚 save 的 assistant(id 不同)会被误判为"新消息"→ 重复 append。
      // 此时已经有 pendingRefetchRef 机制兜底(流式结束后再 refetch),
      // 这里直接放弃本次 refetch。
      if (status === 'submitted' || status === 'streaming') {
        pendingRefetchRef.current = true;
        return;
      }
      setMessages((prev) => {
        // 用 dedupeMessagesByContent(增强版:同 role 空文本被非空"压制")。
        // 场景:prev = [user_msg, empty_assistant(streaming 卡住)],
        //       recovered = [user_msg, full_assistant(backend 完整版)]。
        // 严格 by-content dedupe 会两条都 append → 出现"empty + full" 双 assistant。
        // 增强版 dedupe 会删 empty 留 full,只看到 1 条 assistant。
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

  // cs-round-011:自动续推 — 监听 messages 列表里 metadata.isStreaming 项,
  // 对每条触发 continueFromMessageId fetch,parse UI Message Stream chunks,
  // 把新 text append 到 useChat messages 里同 id 那条上。
  useAutoResumeStreaming({
    messages,
    setMessages: (updater) => setMessages(updater),
    sessionKey: activeId,
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
  function handleSwitchSession(id: string) {
    if (id !== activeId) {
      stop();
      switchSession(id);
      // 同步 URL:刷新页面时 useParams 仍能拿到 sessionId,跳回此会话
      router.replace(`/chat/${id}`);
    }
  }
  function handleCreateSession() {
    stop();
    // cs-round-010:点 "+ 新会话" 不再立刻 nanoid 建壳 — 改走 enterDraft()。
    // activeId 置 null,sessions 列表不变,WelcomeMessage 自动浮现,
    // 真正的 session 创建推迟到 send() 检测到 activeId===null 时(用首条消息派生 title)。
    // 已在 draft 态再点 + 是 no-op(enterDraft 幂等)。
    enterDraft();
    // URL 回根(同 delete-active 行为),避免 useParams 仍指向上一个 sessionId
    // 触发路由同步 effect 把 activeId 又切回去
    router.replace('/');
  }
  function handleDeleteSession(id: string) {
    stop();
    // W11:删除是 async + 后端调用,失败时用 ErrorBubble 兜底
    deleteSession(id)
      .then(() => {
        // 删的是当前 active → URL 回根(否则 useParams 仍指已删的 session,refetch 会 404)
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
    // cs-round-010:draft 态(activeId=null)发首条消息 → 真创建 session,
    // title 由首条消息文本派生(过 sanitizeTitle 脱敏 + 截 30 字)。
    // 这样侧栏出现的就是 "查一下我的订单" 而不是硬编码 "新会话"。
    let currentActiveId = activeId;
    if (!currentActiveId) {
      const userMsg = { role: 'user' as const, parts: [{ type: 'text' as const, text }] };
      const title = deriveTitleFromMessage(userMsg as unknown as Parameters<typeof deriveTitleFromMessage>[0]);
      currentActiveId = createSession({ title });
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
