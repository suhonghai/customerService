import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const ensureBackendSessionMock = vi.fn(async (frontendId: string) => {
  // map frontendId → backendId 1:1 for test convenience
  return Number(frontendId.replace(/\D/g, '')) || 1;
});

vi.mock('@/lib/backend-session', () => ({
  ensureBackendSession: (...args: unknown[]) =>
    (ensureBackendSessionMock as unknown as (...args: unknown[]) => unknown)(...args),
}));
vi.mock('@/lib/visitor', () => ({
  getVisitorId: () => 'test-visitor',
}));
vi.mock('@/lib/auth', () => ({
  // V1 S5:getClientUserId 在测试中默认 null(未登录状态)
  getClientUserId: () => null,
}));

import { useChatState } from './use-chat-state';
import type { UIMessage } from 'ai';

function makeStored(overrides: Partial<unknown> = {}) {
  return {
    id: 1,
    sessionId: 100,
    role: 'assistant',
    content: '',
    parts: [{ type: 'text', text: 'hi' }],
    metadata: null,
    status: 1,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('useChatState', () => {
  beforeEach(() => {
    ensureBackendSessionMock.mockClear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with empty abortedIds and escalationMap', () => {
    const { result } = renderHook(() => useChatState({ activeId: null, setMessages: vi.fn() }));
    expect(result.current.abortedIds.size).toBe(0);
    expect(result.current.escalationMap).toEqual({});
    expect(result.current.backendSessionId).toBeNull();
  });

  it('updates abortedIds via setter', () => {
    const { result } = renderHook(() => useChatState({ activeId: null, setMessages: vi.fn() }));
    act(() => {
      result.current.setAbortedIds(new Set(['msg-1']));
    });
    expect(result.current.abortedIds.has('msg-1')).toBe(true);
  });

  it('upserts backend session and sets backendSessionId when activeId is set', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useChatState({ activeId: id, setMessages: vi.fn() }),
      { initialProps: { id: null as string | null } },
    );
    rerender({ id: 'sess-42' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ensureBackendSessionMock).toHaveBeenCalledWith('sess-42', 'test-visitor', null);
    expect(result.current.backendSessionId).toBe(42);
  });

  it('loads history into messages and marks last interrupted assistant', async () => {
    const setMessages = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            makeStored({ id: 1, role: 'user', parts: [{ type: 'text', text: 'q' }] }),
            makeStored({
              id: 2,
              role: 'assistant',
              status: 3,
              parts: [{ type: 'text', text: 'partial' }],
            }),
          ],
        }),
        { status: 200 },
      ),
    );
    renderHook(() => useChatState({ activeId: 'sess-99', setMessages }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(setMessages).toHaveBeenCalledOnce();
    const arg = setMessages.mock.calls[0][0] as UIMessage[];
    expect(arg).toHaveLength(2);
    // 最后一条 assistant 带 isInterrupted
    const last = arg[1] as unknown as UIMessage<{ isInterrupted?: boolean }>;
    expect(last.metadata?.isInterrupted).toBe(true);
  });
});
