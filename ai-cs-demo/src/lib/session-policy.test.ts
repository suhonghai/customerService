import { describe, it, expect } from 'vitest';
import type { UIMessage } from 'ai';
import { shouldCreateNewSession, findReusableEmptySession } from './session-policy';
import type { Session } from '@/hooks/use-sessions';

function makeMsg(id: string, role: 'user' | 'assistant' = 'user'): UIMessage {
  return { id, role, parts: [{ type: 'text', text: 'hi' }] } as unknown as UIMessage;
}

describe('shouldCreateNewSession', () => {
  it('returns true when activeId is null (no session exists, must create)', () => {
    expect(shouldCreateNewSession(null, [])).toBe(true);
  });

  it('returns true when activeId is non-null and messages exist (user wants fresh start)', () => {
    expect(shouldCreateNewSession('abc', [makeMsg('1')])).toBe(true);
  });

  it('returns false when activeId is non-null and messages are empty (already in empty session, no-op)', () => {
    // 这是核心 case:用户连点 "+ 新会话" 时,前一次创建后 messages=[],
    // 再点就不该再造壳,避免污染 sidebar
    expect(shouldCreateNewSession('abc', [])).toBe(false);
  });
});

function makeSession(id: string, msgCount: number): Session {
  return {
    id,
    title: '新会话',
    createdAt: 0,
    updatedAt: 0,
    messages: Array.from({ length: msgCount }, (_, i) => makeMsg(`${id}-m${i}`)),
  };
}

describe('findReusableEmptySession', () => {
  it('returns null when sessions is empty (nothing to reuse, let create() handle)', () => {
    expect(findReusableEmptySession([], null)).toBeNull();
  });

  it('returns the empty session when active is non-empty (jump to existing empty)', () => {
    // 用户场景:session 1 有内容,点 + → 切到 sidebar 已有空 session 2,
    // 不再 create 一个新空壳
    const a = makeSession('A', 2);
    const b = makeSession('B', 0);
    expect(findReusableEmptySession([a, b], 'A')?.id).toBe('B');
  });

  it('returns the empty session regardless of array order', () => {
    // 顺序无关 — 数组里只要有空的就返回,active 在中间也 OK
    const a = makeSession('A', 0);
    const b = makeSession('B', 3);
    expect(findReusableEmptySession([a, b], 'B')?.id).toBe('A');
  });

  it('returns null when only the active session exists and is empty (already there)', () => {
    // 用户连点 + 的退化 case:只有一个空会话,点啥都 no-op
    const a = makeSession('A', 0);
    expect(findReusableEmptySession([a], 'A')).toBeNull();
  });

  it('returns the empty session when activeId is null (first-entry activates existing empty)', () => {
    // 首次进入页面,store load 完 sessions 还没 activate,这时点 +
    // 应跳到 sidebar 里已有的空会话(例如上次关页时留下的)
    const a = makeSession('A', 0);
    expect(findReusableEmptySession([a], null)?.id).toBe('A');
  });
});
