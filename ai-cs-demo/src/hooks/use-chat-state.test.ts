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

/** 默认 loadedFromLocalRef=false(模拟 RAGChat 没从 local 加载,需 backend fetch) */
function makeArgs(overrides: { activeId?: string | null; loadedFromLocal?: boolean } = {}) {
  return {
    activeId: (overrides.activeId ?? null) as string | null,
    loadedFromLocalRef: { current: overrides.loadedFromLocal ?? false },
    setMessages: vi.fn(),
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
    const { result } = renderHook(() => useChatState(makeArgs()));
    expect(result.current.abortedIds.size).toBe(0);
    expect(result.current.escalationMap).toEqual({});
    expect(result.current.backendSessionId).toBeNull();
  });

  it('updates abortedIds via setter', () => {
    const { result } = renderHook(() => useChatState(makeArgs()));
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
      ({ id, loadedFromLocal }: { id: string | null; loadedFromLocal: boolean }) =>
        useChatState(makeArgs({ activeId: id, loadedFromLocal })),
      { initialProps: { id: null as string | null, loadedFromLocal: false } },
    );
    rerender({ id: 'sess-42', loadedFromLocal: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ensureBackendSessionMock).toHaveBeenCalledWith('sess-42', 'test-visitor', null);
    expect(result.current.backendSessionId).toBe(42);
  });

  it('loads history into messages and marks last interrupted assistant (loadedFromLocalRef=false)', async () => {
    // 场景:RAGChat 没从 local 加载(localStorage 空,常见于 backend merge 新会话)
    // → useChatState 兜底 fetch /history 并 setMessages
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
    renderHook(() =>
      useChatState({
        activeId: 'sess-99',
        loadedFromLocalRef: { current: false },
        setMessages,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 10));
    });
    // setMessages 被调一次(prev 是默认空数组,diff/append 直接返回 restored)
    expect(setMessages).toHaveBeenCalled();
    const updater = setMessages.mock.calls[0][0] as (prev: UIMessage[]) => UIMessage[];
    const arg = updater([]);
    expect(arg).toHaveLength(2);
    // 最后一条 assistant 带 isInterrupted
    const last = arg[1] as unknown as UIMessage<{ isInterrupted?: boolean }>;
    expect(last.metadata?.isInterrupted).toBe(true);
  });

  it('cs-round-012:fetch /history even when loadedFromLocalRef=true, append backend-only messages (no overwrite)', async () => {
    // 场景:RAGChat 已在 useLayoutEffect 同步从 localStorage 加载(只有 user 消息),
    // 后端 /history 返回 user + assistant — 必须 append assistant 到本地 messages,
    // 而**不能**覆盖(否则会闪)。
    const setMessages = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            makeStored({ id: 1, role: 'user', parts: [{ type: 'text', text: 'q' }] }),
            makeStored({
              id: 2,
              role: 'assistant',
              status: 1,
              content: 'hello',
              parts: [{ type: 'text', text: 'hello' }],
            }),
          ],
        }),
        { status: 200 },
      ),
    );
    renderHook(() =>
      useChatState({
        activeId: 'sess-77',
        loadedFromLocalRef: { current: true },
        setMessages,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 10));
    });
    // ensureBackendSession 必跑(WS 需要 backendSessionId)
    expect(ensureBackendSessionMock).toHaveBeenCalledWith('sess-77', 'test-visitor', null);
    // setMessages 必须用 updater(prev => ...) 形式被调一次(diff/append)
    expect(setMessages).toHaveBeenCalled();
    const lastCall = setMessages.mock.calls[setMessages.mock.calls.length - 1];
    expect(typeof lastCall[0]).toBe('function');
    // 模拟 localStorage 已有 user 消息(id=1)→ diff 应该只 append id=2
    const localPrev: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [{ type: 'text', text: 'q' }],
        metadata: {},
      } as unknown as UIMessage,
    ];
    const merged = (lastCall[0] as (prev: UIMessage[]) => UIMessage[])(localPrev);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('1'); // 本地 user 还在最前
    expect(merged[1].id).toBe('2'); // 后端 assistant 被 append
  });

  it('cs-round-012:loadedFromLocalRef=true + backend empty messages → 不调 setMessages', async () => {
    // 场景:localStorage 有内容,后端 0 条(刚 upsert,首条消息未发出)。
    // 必须不调 setMessages(否则空数组会覆盖本地内容 → 闪)。
    const setMessages = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    renderHook(() =>
      useChatState({
        activeId: 'sess-empty',
        loadedFromLocalRef: { current: true },
        setMessages,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(setMessages).not.toHaveBeenCalled();
  });
});