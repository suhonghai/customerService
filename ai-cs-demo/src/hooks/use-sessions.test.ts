import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessions } from './use-sessions';

const STORAGE_KEY = 'cs_sessions_v1';
const ACTIVE_KEY = 'cs_active_session_v1';

function seedSessionInStorage(id: string, title = '已有会话') {
  const session = {
    id,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([session]));
  window.localStorage.setItem(ACTIVE_KEY, id);
}

function readSessionsFromStorage(): Array<{ id: string }> | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Array<{ id: string }>) : null;
}

/**
 * Bug:小服客服新建会话后刷新页面,会话消失。
 *
 * 根因(代码已坐实):
 *   use-sessions.ts mount effect 把"后端返空 / 鉴权失败"统一当作"后端真空",
 *   然后无条件清空 localStorage(`cs_sessions_v1`),导致用户新建的会话被抹掉。
 *   同时 persist 走 effect + hydratedRef 守卫,极快点击时 hydrate 未完成
 *   → 跳过 persist,会话只活在内存。
 *
 * 这些 spec 锁定"刷新后会话必须保留"的外部可观察行为,防回归。
 */
describe('useSessions — refresh persistence (cs-session-persist bug)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Scenario 1: 后端 /api/customer/sessions/list 返 401(鉴权失败)→ 不应 wipe localStorage 已存在的会话', async () => {
    // Given — 刷新前 localStorage 已有会话(用户当前设备上创建过)
    seedSessionInStorage('existing-session-1');

    // And — 后端 list 返 401(已登录但 token 过期 / cookie 失效,模拟 wipe 触发条件)
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 10001, message: '未登录' }), { status: 401 }),
    );

    // When — 重新挂载 hook(等价于用户刷新页面)
    const { result } = renderHook(() => useSessions());
    // 等异步 fetch + merge 完成
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Then — localStorage 中的会话必须依然存在(401 ≠ "后端真空",不能 wipe)
    const persisted = readSessionsFromStorage();
    expect(persisted, 'localStorage 不应被 401 触发 wipe').not.toBeNull();
    expect(persisted).toHaveLength(1);
    expect(persisted![0].id).toBe('existing-session-1');

    // And — hook state 应当还原该会话
    expect(result.current.sessions.map((s) => s.id)).toContain('existing-session-1');
  });

  it('Scenario 2: 后端返 200 但 sessions=[] → localStorage 优先,不应 wipe 本地会话', async () => {
    // Given — 刷新前 localStorage 有会话(后端 list 暂时没同步 / 新设备首次拉取 / upsert 失败)
    seedSessionInStorage('local-only-session');

    // And — 后端 list 返 200 但空(后端真空 — 但不代表 localStorage 该被清)
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { sessions: [] } }), { status: 200 }),
    );

    // When — 重新挂载
    const { result } = renderHook(() => useSessions());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    // Then — localStorage 优先:本地会话必须保留(localStorage 是单一真相,后端只是补充)
    const persisted = readSessionsFromStorage();
    expect(persisted, '后端真空不应导致 localStorage 被 wipe').not.toBeNull();
    expect(persisted).toHaveLength(1);
    expect(persisted![0].id).toBe('local-only-session');
    expect(result.current.sessions.map((s) => s.id)).toContain('local-only-session');
  });

  it('Scenario 3: mount 完成前点击 "+ 新会话" → 新会话必须写入 localStorage(不被 hydrate guard 跳过)', async () => {
    // Given — localStorage 已有 1 个会话,后端 401(模拟刷新场景)
    seedSessionInStorage('pre-existing');
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 10001, message: '未登录' }), { status: 401 }),
    );

    // When — 重新挂载,并在 mount 异步完成**之前**立刻点新建会话
    const { result } = renderHook(() => useSessions());
    // 立即点击,不等待 fetchRemoteSessions 完成 — 模拟用户极快点击
    act(() => {
      result.current.createSession();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    // Then — 新会话必须落 localStorage(不能因为 hydratedRef 守卫跳过 persist)
    const persisted = readSessionsFromStorage();
    expect(persisted, 'createSession 必须触发 persist,不能依赖 hydrate 时序').not.toBeNull();
    expect(persisted!.length, '应有原会话 + 新建会话').toBeGreaterThanOrEqual(2);
    expect(result.current.sessions.length).toBeGreaterThanOrEqual(2);
  });
});
