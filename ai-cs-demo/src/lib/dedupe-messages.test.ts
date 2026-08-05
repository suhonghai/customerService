import { describe, it, expect } from 'vitest';
import { dedupeMessagesByContent, dedupeUIMessages, messageContentKey } from './dedupe-messages';
import type { UIMessage } from 'ai';

function msg(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;
}

describe('messageContentKey', () => {
  it('returns role:text', () => {
    expect(messageContentKey({ role: 'user', parts: [{ type: 'text', text: 'hi' }] }))
      .toBe('user:hi');
  });

  it('joins multiple text parts', () => {
    expect(messageContentKey({
      role: 'assistant',
      parts: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
    })).toBe('assistant:ab');
  });

  it('ignores non-text parts (reasoning, tool)', () => {
    const k = messageContentKey({
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'thinking...' },
        { type: 'tool-xxx' },
        { type: 'text', text: 'answer' },
      ],
    });
    expect(k).toBe('assistant:answer');
  });

  it('treats missing parts as empty', () => {
    expect(messageContentKey({ role: 'user' })).toBe('user:');
  });
});

describe('dedupeMessagesByContent', () => {
  it('keeps first occurrence, drops later duplicates', () => {
    const m1 = msg('a', 'user', 'same');
    const m2 = msg('b', 'user', 'same');
    const result = dedupeMessagesByContent([m1, m2]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('preserves order', () => {
    const m1 = msg('a', 'user', 'q1');
    const m2 = msg('b', 'assistant', 'a1');
    const m3 = msg('c', 'user', 'q2');
    const result = dedupeMessagesByContent([m1, m2, m3]);
    expect(result.map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('treats nanoid-id and numeric-id with same content as duplicates (切 session 重复 bug)', () => {
    // 客户端 nanoid + 后端 numeric id,但内容相同 → 视为同一条
    const nanoid = msg('eHvcXURT55jDoGha', 'user', '优惠券怎么用?');
    const backendId = msg('194', 'user', '优惠券怎么用?');
    const result = dedupeMessagesByContent([nanoid, backendId]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('eHvcXURT55jDoGha'); // 保留第一个(顺序保持)
  });

  it('does not merge different texts even if role same', () => {
    const m1 = msg('a', 'user', 'q1');
    const m2 = msg('b', 'user', 'q2');
    const result = dedupeMessagesByContent([m1, m2]);
    expect(result).toHaveLength(2);
  });

  it('does not merge empty vs non-empty text', () => {
    // 已知限制:empty text 和 non-empty text 视为不同(用户 session BY6iyv34L0 命中此情况)。
    // 后续如果需要可以增强(优先保留 non-empty)。
    const m1 = msg('a', 'assistant', '');
    const m2 = msg('b', 'assistant', '目前资料库...');
    const result = dedupeMessagesByContent([m1, m2]);
    expect(result).toHaveLength(2);
  });

  it('returns empty array on empty input', () => {
    expect(dedupeMessagesByContent([])).toEqual([]);
  });
});

describe('dedupeUIMessages', () => {
  it('集成测试:4 条混合 ID 污染场景 → dedupe 到 2 条', () => {
    // 复现 user session BY6iyv34L0 的 localStorage 污染
    const messages = [
      msg('eHvcXURT55jDoGha', 'user', '优惠券怎么用?'),
      msg('194', 'user', '优惠券怎么用?'),
      msg('195', 'assistant', ''),
      msg('2ceMsx0IK3ABMHID', 'assistant', '目前资料库还没收录...'),
    ];
    const result = dedupeUIMessages(messages);
    // user 的两条内容相同,合并为 1 条(保留第一个)
    // assistant 的两条内容不同(empty vs full),均保留
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    expect(result[0].id).toBe('eHvcXURT55jDoGha');
  });
});