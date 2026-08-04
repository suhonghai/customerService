import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// 用 vi.hoisted 让 mock 在工厂外可用
const {
  mockConnectRealtime,
  mockOnOperatorReply,
  mockDisconnectRealtime,
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
  };
});

vi.mock('@/lib/realtime-client', () => ({
  connectRealtime: mockConnectRealtime,
  onOperatorReply: mockOnOperatorReply,
  disconnectRealtime: mockDisconnectRealtime,
}));

import { useRealtime, useRealtimeDisconnectOnUnmount } from './use-realtime';
import type { OperatorReplyPayload } from '@/lib/realtime-client';

describe('useRealtime', () => {
  beforeEach(() => {
    handlers.clear();
    mockConnectRealtime.mockClear();
    mockOnOperatorReply.mockClear();
    mockDisconnectRealtime.mockClear();
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
});
