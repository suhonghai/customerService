'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { getVisitorId } from '@/lib/visitor';
import { sanitizeTitle } from '@/lib/pii-sanitize';
import { withCache } from '@/lib/with-cache';

/**
 * 一个客服会话(终端用户视图)。
 *
 * cs-round-013:**不再做客户端持久化**。sessions 数组只来自后端 list 接口
 * (`/api/customer/sessions/list`)。activeId 由 URL `/chat/[sessionId]` 携带
 * (无 sessionId = draft 模式)。messages **不再内联到 sessions**(避免再次出现
 * 「localStorage 有但 DB 已删 / 多设备状态分裂」类问题)。
 *
 * 业务行为:
 * - mount 时拉后端 list 拿 session 元数据(id / title / messageCount / updatedAt)
 * - 切 session 时按 backend id 走 `/api/sessions/[id]/history` 拿 messages
 *   (由 RAGChat 协调,见 useChatState)
 * - 派生 title、新建会话、删除会话、重命名 — 全部走后端
 */
export interface Session {
  /** 后端 csSession 数字主键 id(列表接口返回)。前端用此作 React key。 */
  id: number;
  /** 后端 sessionKey(per browser,nanoid 派生) — 仅新建会话时前端生成。 */
  sessionKey: string;
  title: string;
  /** 后端字段。messageCount 不再由前端累加 messages.length 计算。 */
  messageCount: number;
  startedAt: string;
  updatedAt: string;
}

const DEFAULT_TITLE = '新会话';

interface RemoteSession {
  id: number;
  sessionKey: string;
  title: string | null;
  visitorId: string;
  userId: number | null;
  messageCount: number;
  updatedAt: string;
  startedAt: string;
}

/**
 * 鉴权 / 网络错误必须显式区分,否则 mount effect 会把 401 / 网络抖动误判为
 * 「后端被清空」→ 显示「还没有会话」(体验退化,但不会再 wipe,因不再写 localStorage)。
 */
export type RemoteFetchResult =
  | { ok: true; sessions: RemoteSession[] }
  | { ok: false; reason: 'auth' | 'network' | 'bad-response' };

/** 拉后端 session 列表 — mount 时单次。withCache 防 Strict Mode dev 双调。 */
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

/**
 * 从 messages 派生 title:取第一条 user message 截前 30 字。
 * 规则:仅在当前 title 还是默认 "新会话" 时才改,允许用户手动重命名后不被覆盖。
 */
/** deriveTitle 实际访问的 part 最小结构 */
interface TextPart {
  type: string;
  text?: string;
}

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
 * 与 deriveTitle 的差别:不依赖 currentTitle,因为 draft 状态还没有任何 session。
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
 * useSessions:多会话管理核心 hook(纯后端驱动版)
 *
 * 职责:
 * - 维护 sessions 列表(只来自后端接口)
 * - 维护 activeId(由 RAGChat 从 URL 同步过来)
 * - 提供 create/delete/rename/switch 五个 action(create 是「前端生 sessionKey →
 *   调后端 upsert 拿真 id → prepend 到列表」)
 * - 自动标题生成(走后端 visitorName 同步;前端只算派生 title 立即同步)
 *
 * cs-round-013:不再做客户端持久化 — sessions 来自 `/api/customer/sessions/list`,
 * activeId 来自 URL。所有 hydration 失败 / 401 都直接显示「还没有会话」。
 */
export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 用 ref 跟踪最新 activeId,避免 updateActiveSession 的 useCallback 闭包陷阱
  const activeIdRef = useRef<string | null>(null);
  // async deleteSession 需要在 callback 里读最新 sessions,避免 useCallback 闭包陷阱
  const sessionsRef = useRef<Session[]>([]);
  // hydrated = 后端 list 已返回(成功或失败都可,失败时列表是空数组 + 显示提示)
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // mount:拉后端 list,setSessions → hydrated。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemoteSessions();
        if (cancelled) return;
        if (remote.ok) {
          setSessions(
            remote.sessions.map((r) => ({
              id: r.id,
              sessionKey: r.sessionKey,
              title: r.title ?? DEFAULT_TITLE,
              messageCount: r.messageCount,
              startedAt: r.startedAt,
              updatedAt: r.updatedAt,
            })),
          );
        }
        // 失败 / 401 / 网络抖动 → sessions 保持空数组(显示「还没有会话」)
      } catch {
        // 静默
      }
      if (cancelled) return;
      hydratedRef.current = true;
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 同步 activeId 到 ref(供 updateActiveSession 读最新值,避免闭包陷阱)
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // 同步 sessions 给 async deleteSession 读最新 sessionKey
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  /**
   * 创建一个 session,**同步**生成 sessionKey 并把它写到 sessions 列表(临时占位
   * id 用负数 backendId 兜底位),**异步**走 upsert 拿真 backendId 替换。
   *
   * cs-round-013 修法:之前 await 后才 setActiveId,导致 send 路径里 sendMessage
   * 在 await 期间不会被调用,但 React 19 + Strict Mode dev 下 effect 双跑会再次触发
   * send,造成 user message 重复 + sidebar 双 session 出现。
   *
   * 现在 createSession 同步返 sessionKey + 立即 setActiveId(临时 id),sendMessage
   * 立即执行;upsert 完成后 effect 替换 sessions 里的临时 id 为 backendId。
   *
   * 临时 id 用负数(避免和后端正数 backendId 冲突),取值 = -(Date.now()) 唯一。
   */
  const createSession = useCallback(
    (opts?: {
      title?: string;
      sessionKey?: string;
      /**
       * cs-round-015:upsert 异步成功(拿到真 backendId)时触发。
       * 用途:RAGChat 在此 callback 内 `router.replace('/chat/${backendId}')`,
       *      把 URL 从 tempId 切到 backendId(URL 是 activeId 真相源,必须同步)。
       * upsert 失败时**不**调 — 此时 activeId 保留 tempId,caller 应自行降级。
       */
      onCommit?: (backendId: number) => void;
    }): { sessionKey: string; tempId: number } => {
      const sessionKey =
        opts?.sessionKey ?? `cs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const tempId = -Date.now(); // 负数避免和后端正数 id 冲突
      const visitorId = getVisitorId();

      const newSession: Session = {
        id: tempId,
        sessionKey,
        title: opts?.title ?? DEFAULT_TITLE,
        messageCount: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      activeIdRef.current = String(tempId);
      setSessions((prev) => [newSession, ...prev.filter((s) => s.id !== tempId)]);
      setActiveId(String(tempId));

      // 异步 upsert — 完成后用 effect 把 sessions 里 tempId 替换为 backendId,
      // 并把 activeId 从 tempId 切到 backendId(url 同步跟过去)。
      void (async () => {
        try {
          const res = await fetch('/api/sessions/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionKey,
              visitorId,
              title: opts?.title ?? DEFAULT_TITLE,
            }),
          });
          if (!res.ok) {
            console.warn('[createSession] upsert failed:', res.status);
            return;
          }
          const json = (await res.json()) as { id: number };
          const backendId = json.id;
          if (backendId === tempId) return;
          // 替换 tempId → backendId
          activeIdRef.current = String(backendId);
          setSessions((prev) =>
            prev.map((s) => (s.id === tempId ? { ...s, id: backendId } : s)),
          );
          setActiveId((cur) => (cur === String(tempId) ? String(backendId) : cur));
          // cs-round-015:通知 caller(典型:RAGChat)URL 同步切到 backendId。
          // 注意:在 setSessions/setActiveId 之后调,caller 拿到的 router state 已是新值。
          opts?.onCommit?.(backendId);
        } catch (e) {
          console.warn('[createSession] upsert error:', (e as Error).message);
        }
      })();

      return { sessionKey, tempId };
    },
    [],
  );

  /** 进入 draft 态(activeId=null)。已在 draft 是 no-op。 */
  const enterDraft = useCallback(() => {
    activeIdRef.current = null;
    setActiveId(null);
  }, []);

  /** 删除会话(后端 DELETE → 成功后前端 filter)。失败抛 Error。 */
  const deleteSession = useCallback(async (id: string): Promise<void> => {
    const target = sessionsRef.current.find((s) => String(s.id) === id);
    const sessionKey = target?.sessionKey ?? id;
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
    setSessions((prev) => prev.filter((s) => String(s.id) !== id));
    setActiveId((currentActive) => {
      if (currentActive !== id) return currentActive;
      const remaining = sessionsRef.current.filter((s) => String(s.id) !== id);
      if (remaining.length === 0) {
        activeIdRef.current = null;
        return null;
      }
      const next = remaining.reduce((latest, s) =>
        new Date(s.updatedAt).getTime() > new Date(latest.updatedAt).getTime() ? s : latest,
      );
      activeIdRef.current = String(next.id);
      return String(next.id);
    });
  }, []);

  /** 重命名会话(本地更新 title + 调后端 PATCH visitorName,fire-and-forget) */
  const renameSession = useCallback((id: string, title: string) => {
    const trimmed = title.trim() || DEFAULT_TITLE;
    setSessions((prev) =>
      prev.map((s) =>
        String(s.id) === id ? { ...s, title: trimmed, updatedAt: new Date().toISOString() } : s,
      ),
    );
  }, []);

  /** 切换激活会话。activeId 由 RAGChat 通过 useEffect 同步。 */
  const switchSession = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  /**
   * 把当前 messages 数组传给 active 会话,派生 title + 更新 messageCount。
   * 不再写 sessions[i].messages(messages 不在前端持久化)。
   * 派生 title 同步到后端(fire-and-forget)。
   */
  const updateActiveSession = useCallback(
    (messages: UIMessage[], visitorId: string) => {
      const currentActiveId = activeIdRef.current;
      if (!currentActiveId) return;
      const backendId = Number(currentActiveId);
      // 仅在 backendId(正数)期间更新;tempId(负数,upsert 进行中)跳过
      if (!Number.isInteger(backendId) || backendId <= 0) return;
      const target = sessionsRef.current.find((s) => s.id === backendId);
      if (!target) return;
      const newTitle = deriveTitle(messages, target.title);
      const newMessageCount = messages.length;
      const newUpdatedAt = new Date().toISOString();
      if (newTitle !== target.title || newMessageCount !== target.messageCount) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id !== backendId
              ? s
              : {
                  ...s,
                  title: newTitle,
                  messageCount: newMessageCount,
                  updatedAt: newUpdatedAt,
                },
          ),
        );
      }
      if (newTitle !== target.title) {
        fetch('/api/sessions/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey: target.sessionKey,
            visitorId,
            title: newTitle,
          }),
        }).catch((e) => console.warn('[title persist] failed', e));
      }
    },
    [],
  );

  const activeSession =
    activeId == null ? null : sessions.find((s) => String(s.id) === activeId) ?? null;

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