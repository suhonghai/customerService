/**
 * cs-round-013:useSessions 数据来自后端 list 接口,不再 seed localStorage。
 *
 * Spec 覆盖:
 * - mount 调 /api/customer/sessions/list,sessions 来自接口
 * - 后端 401/失败 → sessions 空数组,无 wipe(因根本不写 localStorage)
 * - createSession 走后端 upsert 拿 backendId,返回 { sessionKey, backendId }
 * - deleteSession 走后端 DELETE,失败抛 Error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockListOnly(
  sessions: Array<{ id: number; sessionKey: string; title: string; messageCount: number; updatedAt: string; startedAt: string }> = [],
) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/customer/sessions/list')) {
      return new Response(
        JSON.stringify({ code: 0, data: { sessions } }),
        { status: 200 },
      );
    }
    if (url.includes('/api/sessions/upsert')) {
      return new Response(JSON.stringify({ id: 999 }), { status: 200 });
    }
    return new Response('not mocked', { status: 500 });
  });
}

describe('useSessions — cs-round-013 (backend-driven, no localStorage)', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    // 重置模块 — use-sessions.ts 在 module-level 调 withCache 把 fetchRemoteSessions
    // 包成单例;测试间必须重置,否则后续测试拿到首次调用的 cached promise。
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 每个 test 重新 import useSessions(拿 resetModules 后的新模块引用)
  async function freshUseSessions() {
    const mod = await import('./use-sessions');
    return mod.useSessions;
  }

  it('mount 时 fetch /api/customer/sessions/list,渲染 sessions', async () => {
    // Given — 后端返 1 个会话
    const remote = [
      {
        id: 100,
        sessionKey: 'cs-abc',
        title: '测试会话',
        messageCount: 5,
        updatedAt: new Date().toISOString(),
        startedAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ];
    mockListOnly(remote);

    // When
    const useSessions = await freshUseSessions();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Then
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(100);
    expect(result.current.sessions[0].messageCount).toBe(5);
    expect(result.current.hydrated).toBe(true);
  });

  it('后端返 401 → sessions 空数组,不再 wipe 任何东西', async () => {
    // Given — 后端 401
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 10001, message: '未登录' }), { status: 401 }),
    );

    // When
    const useSessions = await freshUseSessions();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Then — 空数组 + hydrated=true(用于 UI 显示"还没有会话")
    expect(result.current.sessions).toHaveLength(0);
    expect(result.current.hydrated).toBe(true);
    // And — 没有 localStorage 写入
    expect(window.localStorage.getItem('cs_sessions_v1')).toBeNull();
  });

  it('createSession({ title }) → 走后端 upsert,返 { sessionKey, backendId },列表 prepend', async () => {
    // Given — 空列表
    mockListOnly([]);
    const useSessions = await freshUseSessions();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // When — 进入 draft → 创建
    act(() => {
      result.current.enterDraft();
    });
    let tempId = 0;
    let sessionKey = '';
    act(() => {
      const r = result.current.createSession({ title: '查订单' });
      tempId = r.tempId;
      sessionKey = r.sessionKey;
    });

    // Then — 同步 setActiveId(tempId 负数),title 写入,upsert 异步进行
    expect(tempId).toBeLessThan(0); // 负数临时 id
    expect(sessionKey).toMatch(/^cs-/); // 自动生成 sessionKey
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe(tempId);
    expect(result.current.sessions[0].title).toBe('查订单');
    expect(result.current.activeId).toBe(String(tempId));

    // And — 等异步 upsert 完成(tempId 替换为 backendId=999)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.activeId).toBe('999');
    expect(result.current.sessions[0].id).toBe(999);
  });

  it('deleteSession(id) → 走后端 DELETE,失败抛 Error', async () => {
    // Given — 1 个会话,DELETE 返 500
    vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ error: 'fail' }), { status: 500 });
      }
      if (url.includes('/api/customer/sessions/list')) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              sessions: [
                {
                  id: 50,
                  sessionKey: 'cs-del',
                  title: '待删',
                  messageCount: 1,
                  updatedAt: new Date().toISOString(),
                  startedAt: new Date().toISOString(),
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response('not mocked', { status: 500 });
    });

    const useSessions = await freshUseSessions();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // When + Then — 抛 Error,前端 list 不变
    await act(async () => {
      await expect(result.current.deleteSession('50')).rejects.toThrow(/fail|HTTP 500/);
    });
    expect(result.current.sessions).toHaveLength(1); // 没被删
  });

  it('renameSession(id, title) → 更新 sessions 列表中对应 title', async () => {
    mockListOnly([
      {
        id: 1,
        sessionKey: 'cs-1',
        title: '原标题',
        messageCount: 0,
        updatedAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      },
    ]);
    const useSessions = await freshUseSessions();
    const { renderHook, act } = await import('@testing-library/react');
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    act(() => {
      result.current.renameSession('1', '新标题');
    });

    expect(result.current.sessions[0].title).toBe('新标题');
  });
});