import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 必须在 vi.mock 之前用 vi.hoisted 提升 mock 状态对象
// (vi.mock factory 被 hoist 到文件顶部,顶层 const 还不可用)
const mocks = vi.hoisted(() => {
  const handlers: Record<string, ((p: any) => void)[]> = {};
  const fakeSocket = {
    on: vi.fn((event: string, cb: (p: any) => void) => {
      handlers[event] = handlers[event] || [];
      handlers[event].push(cb);
      return fakeSocket;
    }),
    removeAllListeners: vi.fn(() => {
      Object.keys(handlers).forEach((k) => delete handlers[k]);
    }),
    disconnect: vi.fn(),
  };
  const requestMock = {
    get: vi.fn(),
    post: vi.fn(),
  };
  return { handlers, fakeSocket, requestMock, ioMock: vi.fn(() => fakeSocket) };
});

vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => mocks.ioMock(...args),
}));

vi.mock('@/services/request', () => ({
  default: mocks.requestMock,
}));

import { useConversation } from './use-conversation';

beforeEach(() => {
  mocks.ioMock.mockClear();
  (mocks.fakeSocket.on as any).mockClear();
  mocks.fakeSocket.removeAllListeners.mockClear();
  mocks.fakeSocket.disconnect.mockClear();
  mocks.requestMock.get.mockReset();
  mocks.requestMock.post.mockReset();
  Object.keys(mocks.handlers).forEach((k) => delete mocks.handlers[k]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('use-conversation', () => {
  it('loads history via REST and exposes messages', async () => {
    const sessionId = 42;
    const msgs = [
      {
        id: 1,
        role: 'user',
        content: 'hi',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:00:00Z',
      },
      {
        id: 2,
        role: 'assistant',
        content: 'hello',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:01:00Z',
      },
    ];
    mocks.requestMock.get.mockResolvedValueOnce({ messages: msgs }); // messages
    mocks.requestMock.get.mockResolvedValueOnce({ sessionKey: 'sess-key-1' }); // session-info

    const { result } = renderHook(() => useConversation(100, sessionId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].id).toBe(1);
    // 触发 socket.io connect
    await act(async () => {
      mocks.handlers['connect']?.forEach((cb) => cb(undefined));
    });
    await waitFor(() => {
      expect(result.current.wsState).toBe('connected');
    });
  });

  it('deduplicates messages pushed from socket and REST push', async () => {
    mocks.requestMock.get.mockResolvedValueOnce({ messages: [] });
    mocks.requestMock.get.mockResolvedValueOnce({ sessionKey: 'k1' });

    const { result } = renderHook(() => useConversation(100, 7));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    // connect
    await act(async () => {
      mocks.handlers['connect']?.forEach((cb) => cb(undefined));
    });
    // push 两次同一个 id,只应出现一次
    await act(async () => {
      mocks.handlers['operator_reply']?.forEach((cb) =>
        cb({
          sessionId: 7,
          messageId: 999,
          role: 'assistant',
          content: 'reply1',
          createdAt: '2026-06-11T10:05:00Z',
        }),
      );
      mocks.handlers['operator_reply']?.forEach((cb) =>
        cb({
          sessionId: 7,
          messageId: 999,
          role: 'assistant',
          content: 'reply1-dup',
          createdAt: '2026-06-11T10:05:00Z',
        }),
      );
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('reply1');
  });

  it('ignores pushes for other sessions', async () => {
    mocks.requestMock.get.mockResolvedValueOnce({ messages: [] });
    mocks.requestMock.get.mockResolvedValueOnce({ sessionKey: 'k1' });

    const { result } = renderHook(() => useConversation(100, 7));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      mocks.handlers['connect']?.forEach((cb) => cb(undefined));
    });
    await act(async () => {
      mocks.handlers['user_message']?.forEach((cb) =>
        cb({
          sessionId: 999, // not ours
          messageId: 1,
          role: 'user',
          content: 'x',
          createdAt: '2026-06-11T10:05:00Z',
        }),
      );
    });
    expect(result.current.messages).toHaveLength(0);
  });

  it('send() POSTs and upserts on REST response when WS off', async () => {
    // session-info 404 — WS off
    mocks.requestMock.get.mockResolvedValueOnce({ messages: [] });
    mocks.requestMock.get.mockRejectedValueOnce(new Error('no session-info endpoint'));
    mocks.requestMock.post.mockResolvedValueOnce({
      id: 555,
      role: 'assistant',
      content: 'manual reply',
      status: 1,
      metadata: { source: 'operator' },
      createdAt: '2026-06-11T10:10:00Z',
    });

    const { result } = renderHook(() => useConversation(100, 7));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.wsState).toBe('off'));

    await act(async () => {
      await result.current.send('  manual reply  ');
    });

    expect(mocks.requestMock.post).toHaveBeenCalledWith('/internal/cs/tickets/100/messages', {
      content: 'manual reply',
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe(555);
  });

  it('send() with empty text is a no-op', async () => {
    mocks.requestMock.get.mockResolvedValueOnce({ messages: [] });
    mocks.requestMock.get.mockResolvedValueOnce({ sessionKey: 'k1' });

    const { result } = renderHook(() => useConversation(100, 7));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send('   ');
    });
    expect(mocks.requestMock.post).not.toHaveBeenCalled();
  });

  it('groups messages by 5-minute intervals', async () => {
    const msgs = [
      {
        id: 1,
        role: 'user',
        content: 'a',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:00:00Z',
      },
      {
        id: 2,
        role: 'assistant',
        content: 'b',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:02:00Z',
      },
      {
        id: 3,
        role: 'user',
        content: 'c',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:10:00Z',
      },
      {
        id: 4,
        role: 'user',
        content: 'd',
        status: 1,
        metadata: {},
        createdAt: '2026-06-11T10:11:00Z',
      },
    ];
    mocks.requestMock.get.mockResolvedValueOnce({ messages: msgs });
    mocks.requestMock.get.mockResolvedValueOnce({ sessionKey: 'k1' });

    const { result } = renderHook(() => useConversation(100, 7));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // 10:00 + 10:02 同组,10:10 + 10:11 同组 → 2 组
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups[0].msgs).toHaveLength(2);
    expect(result.current.groups[1].msgs).toHaveLength(2);
  });

  it('sets wsState to "na" when sessionId is null', async () => {
    const { result } = renderHook(() => useConversation(100, null));
    expect(result.current.wsState).toBe('na');
    expect(mocks.ioMock).not.toHaveBeenCalled();
  });
});
