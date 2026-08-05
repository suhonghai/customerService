import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

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

/** 默认 activeId=42(backend 数字 id)。传 null 时显式保留 null。 */
function makeArgs(overrides: { activeId?: string | null; setMessages?: ReturnType<typeof vi.fn>; setHistoryLoading?: (loading: boolean) => void } = {}) {
  return {
    activeId: (overrides.activeId === undefined ? '42' : overrides.activeId) as string | null,
    setMessages: (overrides.setMessages ?? vi.fn()) as unknown as React.Dispatch<React.SetStateAction<UIMessage[]>>,
    setHistoryLoading: overrides.setHistoryLoading ?? vi.fn(),
  };
}

describe('useChatState — cs-round-013 (history fetch 是唯一加载路径)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // mock 一个兜底 fetch(防止未 mock 时真打网络)
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('not mocked', { status: 500 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with empty abortedIds and escalationMap', () => {
    const { result } = renderHook(() => useChatState(makeArgs({ activeId: null })));
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

  it('activeId 变化时 fetch /history,设置 backendSessionId', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useChatState(makeArgs({ activeId: id })),
      { initialProps: { id: null as string | null } },
    );
    rerender({ id: '77' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current.backendSessionId).toBe(77);
  });

  it('activeId=null(draft)→ 不 fetch /history', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const { result } = renderHook(() =>
      useChatState(makeArgs({ activeId: null })),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.backendSessionId).toBeNull();
  });

  it('history 返回 messages → setMessages updater 形式,backend-only append', async () => {
    // 场景:activeId=99,本地 messages 有 1 条 user(id=1)
    // 后端 /history 返回 user(id=1) + assistant(id=2) → diff 应当 append id=2
    const setMessages = vi.fn();
    const setMessagesArg = setMessages as unknown as React.Dispatch<React.SetStateAction<UIMessage[]>>;
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
        activeId: '99',
        setMessages: setMessagesArg,
        setHistoryLoading: vi.fn(),
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(setMessages).toHaveBeenCalled();
    // updater 形式被调
    const callsWithFn = setMessages.mock.calls.filter(
      (c) => typeof c[0] === 'function',
    );
    expect(callsWithFn.length).toBeGreaterThan(0);
    const updater = callsWithFn[callsWithFn.length - 1][0] as (prev: UIMessage[]) => UIMessage[];
    const localPrev: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        parts: [{ type: 'text', text: 'q' }],
        metadata: {},
      } as unknown as UIMessage,
    ];
    const merged = updater(localPrev);
    expect(merged).toHaveLength(2);
    expect(merged[1].id).toBe('2'); // 后端 assistant 被 append
  });

  it('history 返回空 messages → setMessages([])', async () => {
    // 场景:activeId=88,后端 0 条 → 清空前端 messages(draft 后创建新会话)
    const setMessages = vi.fn();
    const setMessagesArg = setMessages as unknown as React.Dispatch<React.SetStateAction<UIMessage[]>>;
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    renderHook(() =>
      useChatState({
        activeId: '88',
        setMessages: setMessagesArg,
        setHistoryLoading: vi.fn(),
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // 至少有一次 setMessages 调用(空数组)
    expect(setMessages).toHaveBeenCalled();
    const lastCall = setMessages.mock.calls[setMessages.mock.calls.length - 1];
    // 最后一次调用可能是直接传 [] 或 updater([]) 返 [] — 检查任意一次返 [] 的调用
    const passedEmpty = setMessages.mock.calls.some((c) => {
      if (Array.isArray(c[0])) return c[0].length === 0;
      if (typeof c[0] === 'function') {
        const result = (c[0] as (prev: UIMessage[]) => UIMessage[])([
          { id: 'x', role: 'user', parts: [] } as unknown as UIMessage,
        ]);
        return Array.isArray(result) && result.length === 0;
      }
      return false;
    });
    expect(passedEmpty).toBe(true);
    void lastCall;
  });

  it('setHistoryLoading 在 fetch 开始 → 完成被调 true → false', async () => {
    const setHistoryLoading = vi.fn();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );
    renderHook(() =>
      useChatState({
        activeId: '55',
        setMessages: vi.fn() as unknown as React.Dispatch<React.SetStateAction<UIMessage[]>>,
        setHistoryLoading,
      }),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(setHistoryLoading).toHaveBeenCalledWith(true);
    expect(setHistoryLoading).toHaveBeenCalledWith(false);
  });
});