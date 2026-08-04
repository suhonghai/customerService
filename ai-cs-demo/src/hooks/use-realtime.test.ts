import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// 用 vi.hoisted 让 mock 在工厂外可用
const {
  mockConnectRealtime,
  mockOnOperatorReply,
  mockDisconnectRealtime,
  mockRefetchSessionHistory,
  makeSock,
  handlers,
} = vi.hoisted(() => {
  const handlers = new Set<(p: OperatorReplyPayload) => void>();
  const makeSock = () => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: (evt: string, payload: OperatorReplyPayload) => {
      if (evt === 'operator_reply') {
        handlers.forEach((h) => h(payload));
      }
    },
    disconnect: vi.fn(),
  });
  return {
    handlers,
    makeSock,
    mockConnectRealtime: vi.fn(() => makeSock()),
    mockOnOperatorReply: vi.fn((h: (p: OperatorReplyPayload) => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    }),
    mockDisconnectRealtime: vi.fn(),
    mockRefetchSessionHistory: vi.fn(async () => [] as UIMessage[]),
  };
});

vi.mock('@/lib/realtime-client', () => ({
  connectRealtime: mockConnectRealtime,
  onOperatorReply: mockOnOperatorReply,
  disconnectRealtime: mockDisconnectRealtime,
}));

vi.mock('@/lib/refetch-history', () => ({
  refetchSessionHistory: mockRefetchSessionHistory,
}));

import { useRealtime, useRealtimeDisconnectOnUnmount } from './use-realtime';
import type { OperatorReplyPayload } from '@/lib/realtime-client';
import type { UIMessage } from 'ai';

describe('useRealtime', () => {
  beforeEach(() => {
    handlers.clear();
    mockConnectRealtime.mockClear();
    mockOnOperatorReply.mockClear();
    mockDisconnectRealtime.mockClear();
    mockRefetchSessionHistory.mockClear();
    // 重置 mockConnectRealtime 默认实现(vi.fn() 在 beforeEach 不重置实现)
    mockConnectRealtime.mockImplementation(() => makeSock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects and registers handler when enabled with sessionKey', () => {
    const onMessage = vi.fn();
    renderHook(() => useRealtime({ sessionKey: 'sess-A', onMessage, enabled: true }));
    expect(mockConnectRealtime).toHaveBeenCalledWith('sess-A');
    expect(mockOnOperatorReply).toHaveBeenCalledOnce();
    expect(handlers.size).toBe(1);
  });

  it('does not connect when disabled', () => {
    const onMessage = vi.fn();
    renderHook(() => useRealtime({ sessionKey: 'sess-A', onMessage, enabled: false }));
    expect(mockConnectRealtime).not.toHaveBeenCalled();
    expect(mockOnOperatorReply).not.toHaveBeenCalled();
  });

  it('unsubscribes the handler on unmount', () => {
    const onMessage = vi.fn();
    const { unmount } = renderHook(() =>
      useRealtime({ sessionKey: 'sess-A', onMessage, enabled: true }),
    );
    expect(handlers.size).toBe(1);
    unmount();
    expect(handlers.size).toBe(0);
  });

  it('reconnects when sessionKey changes', () => {
    const onMessage = vi.fn();
    const { rerender } = renderHook(
      ({ key }: { key: string }) => useRealtime({ sessionKey: key, onMessage, enabled: true }),
      { initialProps: { key: 'sess-A' } },
    );
    rerender({ key: 'sess-B' });
    expect(mockConnectRealtime).toHaveBeenCalledTimes(2);
    expect(mockConnectRealtime).toHaveBeenLastCalledWith('sess-B');
  });

  it('forwards operator_reply payloads to the handler', () => {
    const onMessage = vi.fn();
    renderHook(() => useRealtime({ sessionKey: 'sess-A', onMessage, enabled: true }));
    const payload = { sessionId: 42 } as OperatorReplyPayload;
    // 触发 mock socket 的 operator_reply
    handlers.forEach((h) => h(payload));
    expect(onMessage).toHaveBeenCalledWith(payload);
  });

  it('useRealtimeDisconnectOnUnmount calls disconnect on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeDisconnectOnUnmount());
    unmount();
    expect(mockDisconnectRealtime).toHaveBeenCalledOnce();
  });

  // 回归 bug(2026-08-04):chat 流式返回过程中 /api/sessions/{id}/history 不停被调
  // 根因:useRealtime 内部 effect 依赖 onRecover / getKnownMessageIds(每次 render 新闭包)
  //   → effect 重跑 → sock.on('connect', ...) listener 累积(只 off 掉 onOperatorReply,其他不清理)
  //   → WS reconnect 一次,所有累积的 connect listener 都跑 refetchSessionHistory → 雪崩
  // 这俩 spec 锁住"render N 次不导致 listener 累积 + 不导致 connect 重跑"语义。
  it('Scenario A: rerender with new onRecover / getKnownMessageIds does NOT reconnect', () => {
    const onMessage = vi.fn();
    const { rerender } = renderHook(
      ({ onRecover, getKnown }: { onRecover: () => void; getKnown: () => Set<string> }) =>
        useRealtime({
          sessionKey: 'sess-A',
          onMessage,
          enabled: true,
          onRecover,
          getKnownMessageIds: getKnown,
        }),
      { initialProps: { onRecover: () => undefined, getKnown: () => new Set<string>() } },
    );
    expect(mockConnectRealtime).toHaveBeenCalledTimes(1);

    // 5 次 rerender,每次传新函数引用
    for (let i = 0; i < 5; i++) {
      rerender({ onRecover: () => undefined, getKnown: () => new Set<string>() });
    }

    // 关键断言:connect 仍只调 1 次(props 变化不重连)
    expect(mockConnectRealtime).toHaveBeenCalledTimes(1);
  });

  it('Scenario B: rerender with new function props does NOT accumulate sock.on(connect, ...) listeners', () => {
    const onMessage = vi.fn();
    const sock = makeSock();
    mockConnectRealtime.mockReturnValue(sock);
    const { rerender } = renderHook(
      ({ onRecover }: { onRecover: () => void }) =>
        useRealtime({ sessionKey: 'sess-A', onMessage, enabled: true, onRecover }),
      { initialProps: { onRecover: () => undefined } },
    );
    const initialConnectCount = sock.on.mock.calls.filter(
      (c: unknown[]) => c[0] === 'connect',
    ).length;
    expect(initialConnectCount).toBeGreaterThan(0);

    // 5 次 rerender 传新 onRecover
    for (let i = 0; i < 5; i++) {
      rerender({ onRecover: () => undefined });
    }

    // 关键断言:connect listener 没累积(初次注册后不增加)
    const finalConnectCount = sock.on.mock.calls.filter(
      (c: unknown[]) => c[0] === 'connect',
    ).length;
    expect(finalConnectCount).toBe(initialConnectCount);
  });

  // 回归 bug(2026-08-04):点左边的会话列表切 session,history 接口被请求 2 次
  // 根因:切 session 时 useRealtime 重新连接(connectRealtime 同 key 复用,不同 key
  //   会 disconnect 旧 socket + 建新 socket),新 socket 触发 connect 事件,
  //   onConnectRecover handler 跑 → isFirstConnectRef.current 跨 session 不重置(已为 false)
  //   → 跳过 "首次" 跳过逻辑 → 进入 refetch 分支 → 调 refetchSessionHistory
  //   → 与 use-chat-state 拉的 history 合计 2 次
  // 修复:isFirstConnectRef 在 sessionKey 变化时重置为 true(新 session 的"首次"连接不需要 refetch)
  it('Scenario C: 切 session 时新 socket connect 事件不应触发 refetchSessionHistory', async () => {
    const onMessage = vi.fn();
    const onRecover = vi.fn();
    const { rerender } = renderHook(
      ({ key }: { key: string }) =>
        useRealtime({
          sessionKey: key,
          onMessage,
          enabled: true,
          backendSessionId: 100,
          onRecover,
          getKnownMessageIds: () => new Set<string>(),
        }),
      { initialProps: { key: 'sess-A' } },
    );

    // 关键步骤 1:模拟"sess-A 已连上 backend" — 手动触发 sockA 的 connect handlers
    // 这样 isFirstConnectRef 才会被 set 为 false(真实环境下 WS 几乎立即连上,
    // mock sock 的 .on 只记录调用,不会自动触发 — 需要手动 await 跑)
    const sockA = mockConnectRealtime.mock.results[0]?.value;
    const handlersA = sockA.on.mock.calls
      .filter((c: unknown[]) => c[0] === 'connect')
      .map((c: unknown[]) => c[1] as () => unknown | Promise<unknown>);
    for (const h of handlersA) {
      await h();
    }

    // 切 session 到 B(connectRealtime mock 每次调 makeSock 返回新 sock)
    rerender({ key: 'sess-B' });

    // 关键步骤 2:触发 sockB 的 connect events(模拟新 socket 连到 backend)
    const sockB = mockConnectRealtime.mock.results.at(-1)?.value;
    const handlersB = sockB.on.mock.calls
      .filter((c: unknown[]) => c[0] === 'connect')
      .map((c: unknown[]) => c[1] as () => unknown | Promise<unknown>);
    for (const h of handlersB) {
      await h();
    }

    // 关键断言:切 session 的"首次"连接 不应触发 refetch
    expect(mockRefetchSessionHistory).not.toHaveBeenCalled();
  });
});
