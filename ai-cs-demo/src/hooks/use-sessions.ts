'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { UIMessage } from 'ai';
import { getVisitorId } from '@/lib/visitor';
import { sanitizeTitle } from '@/lib/pii-sanitize';
import { withCache } from '@/lib/with-cache';

/**
 * 一个客服会话。
 * messages 数组整体替换式切换(不污染其它会话),
 * 切走的会话保留完整历史,切回来时再 setMessages 加载。
 */
export interface Session {
  id: string;
  /** 后端持久化的 sessionKey(跨设备用)。mount 时拉后端列表合并会用到 */
  remoteSessionKey?: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
}

const STORAGE_KEY = 'cs_sessions_v1';
const ACTIVE_KEY = 'cs_active_session_v1';
const DEFAULT_TITLE = '新会话';

interface RemoteSession {
  sessionKey: string;
  title: string | null;
  visitorId: string;
  userId: number | null;
  messageCount: number;
  updatedAt: string;
  startedAt: string;
}

/** 从 localStorage 加载 sessions 数组,失败 / 空 → 返回 null(由调用方决定是否新建) */
function loadSessions(): Session[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadActiveId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function persistSessions(sessions: Session[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // quota exceeded 等情况下静默 — 聊天体验优先于持久化
  }
}

function persistActiveId(id: string | null) {
  try {
    if (id === null) {
      window.localStorage.removeItem(ACTIVE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_KEY, id);
    }
  } catch {
    // 静默
  }
}

/**
 * 自动从 messages 推断新标题:第一条 user message 截前 30 字。
 * 规则:仅在当前 title 还是默认 "新会话" 时才改,允许用户手动重命名后不被覆盖。
 */
/** deriveTitle 实际访问的 part 最小结构 */
interface TextPart {
  type: string;
  text?: string;
}

/** fetchRemoteSessions 返回结果 — 必须显式区分"鉴权失败/网络错误"与"成功且真空",
 * 否则 mount effect 会把 401 / 网络抖动误判为"后端被清空"→ wipe localStorage。
 *
 * (回归 bug:cs-session-persist — 新建会话刷新即丢,根因即此处 + mount 的 wipe 分支)
 */
export type RemoteFetchResult =
  | { ok: true; sessions: RemoteSession[] }
  | { ok: false; reason: 'auth' | 'network' | 'bad-response' };

/** 拉后端 session 列表 — mount 时防 localStorage 丢历史
 *
 * 注意:必须走相对路径(`/api/customer/sessions/list`),不能拼 NEXT_PUBLIC_API_BASE_URL
 * (那是 backend 3001,这个 Next route 只在 ai-cs-demo 自己 9529 才有)
 *
 * withCache 包住 — 防 React Strict Mode dev 双调用 effect 重复请求(只 1 次真请求,后续命中 cache)
 * 失败 reset:401/network 错误下次可重试(不会永久缓存 reject)
 */
const fetchRemoteSessions = withCache(async (): Promise<RemoteFetchResult> => {
  try {
    const res = await fetch('/api/customer/sessions/list', {
      method: 'GET',
      credentials: 'include',
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'auth' };
    }
    if (!res.ok) {
      return { ok: false, reason: 'network' };
    }
    const json = (await res.json()) as { code?: number; data?: { sessions?: RemoteSession[] } };
    if (json.code !== 0) {
      return { ok: false, reason: 'bad-response' };
    }
    return { ok: true, sessions: json.data?.sessions ?? [] };
  } catch {
    return { ok: false, reason: 'network' };
  }
});

function deriveTitle(messages: UIMessage[], currentTitle: string): string {
  if (currentTitle !== DEFAULT_TITLE) return currentTitle;
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return currentTitle;
  const text =
    firstUser.parts
      ?.filter((p: TextPart) => p.type === 'text')
      .map((p: TextPart) => p.text)
      .join('') || '';
  const trimmed = sanitizeTitle(text);
  if (!trimmed) return currentTitle;
  return trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed;
}

/**
 * 从单条 user message 派生 title(用于 draft → commitDraft 路径)。
 * 与 deriveTitle 的差别:不依赖 currentTitle,因为 draft 状态还没有任何 session,
 * 也就不存在"是否覆盖手动命名"的问题。
 *
 * 规则(与 deriveTitle 一致):
 * - 拼接 parts 中所有 type==='text' 的 text
 * - 过 sanitizeTitle(PII 脱敏 + 空白折叠 + 200 字上限)
 * - 截前 30 字,> 30 加 "..."
 * - sanitize 后为空(纯空白 / PII 抹光)→ 退回 DEFAULT_TITLE '新会话'
 */
export function deriveTitleFromMessage(msg: UIMessage): string {
  const text =
    msg.parts
      ?.filter((p: TextPart) => p.type === 'text')
      .map((p: TextPart) => p.text)
      .join('') || '';
  const trimmed = sanitizeTitle(text);
  if (!trimmed) return DEFAULT_TITLE;
  return trimmed.length > 30 ? trimmed.slice(0, 30) + '...' : trimmed;
}

/**
 * useSessions:多会话管理核心 hook
 *
 * 职责:
 * - 维护 sessions 列表 + activeId(当前激活会话)
 * - 同步到 localStorage(挂载时 load,messages 变化时 save)
 * - 提供 create/delete/rename/switch/update 五个 action
 * - 自动标题生成(取第一条 user message 前 30 字)
 * - 保证至少 1 个会话(删完自动新建)
 *
 * 跟 useChat 的协作模式(由 page.tsx 负责串联):
 *   useEffect([messages], () => updateActiveSession(messages))   // 写回
 *   handleSwitch = (id) => { stop(); switchSession(id); setMessages(activeSession.messages) }  // 加载
 */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 用 ref 跟踪最新 activeId,避免 updateActiveSession 的 useCallback 闭包陷阱
  const activeIdRef = useRef<string | null>(null);
  // W11:async deleteSession 需要在 callback 里读最新 sessions(找 remoteSessionKey),
  // 同样避免 useCallback 闭包陷阱
  const sessionsRef = useRef<Session[]>([]);
  // 防止挂载时 setState 触发持久化写盘(初始 load 不算"变更")
  const hydratedRef = useRef(false);
  // 暴露 hydrated state 给上层(ChatView 用它判断是否显示 loading vs welcome)
  const [hydrated, setHydrated] = useState(false);

  // 挂载时从 localStorage load,并发拉后端 list merge 防丢历史

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) 立即从 localStorage 加载(localStorage 优先,UI 立刻有内容)
      const loaded = loadSessions();
      const savedActive = loadActiveId();
      const initial = loaded ?? [];

      if (initial.length > 0) {
        const validActive =
          savedActive && initial.some((s) => s.id === savedActive) ? savedActive : initial[0].id;
        activeIdRef.current = validActive;
        setSessions(initial);
        setActiveId(validActive);
        if (!validActive) persistActiveId(initial[0].id);
      } else {
        // localStorage 空:不自动建,UI 显示"还没有会话"+"+ 新会话"按钮让用户主动建
        // (Admin 清表 / 首次访问都进此分支)
      }

      // 关键修复(回归 cs-session-persist):localStorage load 完成即视为 hydrated。
      // 旧逻辑把 hydratedRef.current = true 放在 await fetchRemoteSessions() 之后,
      // 导致 mount 完成前极快点击"+ 新会话"时,mutation 触发的 persist effect 被守卫跳过,
      // 会话只活在内存 → 刷新即丢。
      // 现在 load 完立即标记 hydrated,后续异步 fetch / merge 不阻塞 mutation persist。
      hydratedRef.current = true;
      if (!cancelled) setHydrated(true);

      // 2) 后端拉取,merge(后端只补充,不 wipe、不覆盖)
      try {
        const remote = await fetchRemoteSessions();
        if (cancelled) return;
        if (remote.ok && remote.sessions.length > 0) {
          // 合并:后端只补充 localStorage 没有的 session;已存在的 session 不动 localStorage
          // (用户当前编辑的内容 / 派生标题 优先于后端标题)。
          // 关键:不再做 wipe —— 401 / 网络错误 / 后端真空 → 一律静默保留 localStorage。
          setSessions((prev) => {
            const map = new Map(prev.map((s) => [s.remoteSessionKey ?? s.id, s]));
            for (const r of remote.sessions) {
              const existing = map.get(r.sessionKey);
              if (!existing) {
                // backend 有但 localStorage 没 → 新增(降级 messages=[],刷新时由 getSessionMessages 拉)
                map.set(r.sessionKey, {
                  id: r.sessionKey, // 用 sessionKey 当 id,简化合并
                  remoteSessionKey: r.sessionKey,
                  title: r.title ?? DEFAULT_TITLE,
                  createdAt: new Date(r.startedAt).getTime(),
                  updatedAt: new Date(r.updatedAt).getTime(),
                  messages: [],
                });
              }
              // 已存在 → 保留 localStorage 的版本(localStorage 优先)
            }
            return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
          });
        }
      } catch {
        // 后端拉取失败,静默(保留 localStorage)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 列表变更时持久化(挂载那次不算)
  useEffect(() => {
    if (!hydratedRef.current) return;
    persistSessions(sessions);
  }, [sessions]);

  // activeId 变更时持久化
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (activeId) persistActiveId(activeId);
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  // 同步 activeId 到 ref(供 updateActiveSession 读最新值,避免闭包陷阱)
  // 必须在每个会改 activeId 的地方同步更新 ref,因为 React effect 异步,
  // 同步的 setState 后立刻读 ref 会拿到旧值
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // W11:同样同步 sessions 数组给 async deleteSession 读最新 remoteSessionKey
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  /** 新建会话,自动切到新会话,返回新 id
   *
   * cs-round-010:点 "+ 新会话" 不再调这个 — 改走 enterDraft() 进入 draft 态
   * (activeId=null,无 session 入列表)。这个函数现在只在 send() 检测到
   * activeId===null 时被调,用于把"draft 首条消息"落成真 session,
   * 此时必须传 {title} 由首条消息文本派生(而不是硬编码 DEFAULT_TITLE),
   * 避免侧栏再闪一下"新会话"。
   */
  const createSession = useCallback((opts?: { title?: string }): string => {
    const id = nanoid(10);
    const now = Date.now();
    const newSession: Session = {
      id,
      title: opts?.title ?? DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    // 同步更新 ref(useEffect 异步,这里必须立即更新,避免后续 updateActiveSession 写到旧 session)
    activeIdRef.current = id;
    setSessions((prev) => [newSession, ...prev]);
    setActiveId(id);
    return id;
  }, []);

  /** 进入 draft 态(activeId=null,sessions 列表不变)。
   *
   * cs-round-010:这是 "+ 新会话" 按钮的真实入口。点 + 不再立刻 nanoid 建壳,
   * 只切到 draft 模式,展示欢迎页;真正的 session 创建推迟到用户发出首条消息时。
   * 再次 enterDraft() 是 no-op(已经 draft)。
   */
  const enterDraft = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
  }, []);

  /** 删除会话(至少保留 1 个);删的是 active → 自动切到最新一个
   *
   * W11:从纯前端 filter 改成"先调后端 DELETE → 成功再前端 filter"。
   * 失败抛 Error(让 page.tsx 的 try/catch 走 ErrorBubble 渲染);
   * 注意:后端调用失败时**不**改前端 state,保证 localStorage / 服务端不一致时
   * 下次 mount 还能看到会话。
   */
  const deleteSession = useCallback(async (id: string): Promise<void> => {
    // 找到 sessionKey(backend 持久化的 key)。本地新建的 session 没有 remoteSessionKey,
    // 用本地 id 兜底 — 这种"纯本地"会话后端一定不存在,DELETE 会 404,
    // 我们仍然从前端移除(local-only 不会复活)。
    const target = sessionsRef.current.find((s) => s.id === id);
    const sessionKey = target?.remoteSessionKey ?? id;
    const visitorId = getVisitorId();
    const res = await fetch(
      '/api/customer/sessions/' +
        encodeURIComponent(sessionKey) +
        '?visitorId=' +
        encodeURIComponent(visitorId),
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    setSessions((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length === 0) {
        // 全删光:不自动建,UI 显示"还没有会话"+"+ 新会话"按钮让用户主动建
        activeIdRef.current = null;
        setActiveId(null);
        persistSessions([]);
        persistActiveId(null);
        return [];
      }
      // 如果删的是当前 active,切到剩余中 updatedAt 最大的
      setActiveId((currentActive) => {
        if (currentActive !== id) return currentActive;
        const next = filtered.reduce(
          (latest, s) => (s.updatedAt > latest.updatedAt ? s : latest),
          filtered[0],
        ).id;
        activeIdRef.current = next; // 同步 ref
        return next;
      });
      return filtered;
    });
  }, []);

  /** 重命名会话 */
  const renameSession = useCallback((id: string, title: string) => {
    const trimmed = title.trim() || DEFAULT_TITLE;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed, updatedAt: Date.now() } : s)),
    );
  }, []);

  /** 切换激活会话(只改 activeId,messages 加载由调用方负责) */
  const switchSession = useCallback((id: string) => {
    setSessions((prev) => {
      if (!prev.some((s) => s.id === id)) return prev;
      return prev;
    });
    activeIdRef.current = id; // 同步 ref
    setActiveId(id);
  }, []);

  /**
   * 把当前 messages 数组写回 active 会话。
   * 核心:每次 messages 变化都调一次,负责:
   *   1) 同步 messages 数组
   *   2) 自动更新 updatedAt(让 sidebar 排序正确)
   *   3) 自动派生 title(仅当 title 还是默认 "新会话")
   *
   * 用 activeIdRef 读最新 activeId,而不是 useCallback 闭包(避免 React 19 下
   * "state 已更新但 useCallback 还没重建"导致的 stale closure)。
   */
  const updateActiveSession = useCallback((messages: UIMessage[], visitorId: string) => {
    const currentActiveId = activeIdRef.current;
    if (!currentActiveId) return;
    setSessions((prev) => {
      const target = prev.find((s) => s.id === currentActiveId);
      if (!target) return prev;
      const newTitle = deriveTitle(messages, target.title);
      if (newTitle !== target.title) {
        // fire-and-forget:把派生出的新 title 写回后端 visitorName,
        // 避免刷新时 backend 把 visitorName 映射回 title 覆盖掉首问派生。
        // 失败只 warn,不抛(下次刷新会再次派生)。
        fetch('/api/sessions/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey: currentActiveId,
            visitorId,
            title: newTitle,
          }),
        }).catch((e) => console.warn('[title persist] failed', e));
      }
      return prev.map((s) => {
        if (s.id !== currentActiveId) return s;
        return {
          ...s,
          title: newTitle,
          messages,
          updatedAt: Date.now(),
        };
      });
    });
  }, []);

  return {
    sessions,
    activeId,
    activeSession,
    hydrated,
    createSession,
    enterDraft,
    deleteSession,
    renameSession,
    switchSession,
    updateActiveSession,
  };
}
