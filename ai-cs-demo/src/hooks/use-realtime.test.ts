import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// 用 vi.hoisted 让 mock 在工厂外可用
const { mockConnectRealtime, mockOnOperatorReply, mockDisconnectRealtime, handlers } = vi.hoisted(
  () => {
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
  },
);

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
});
