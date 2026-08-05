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

  it('drops empty-text placeholder when same role has a non-empty one (2026-08-05 增强)', () => {
    // 历史场景:localStorage 里有 a_195(后端 numeric id, parts=[], text="")和
    // a_nanoid(客户端 id, parts=full, text="目前...")共存。
    // 严格 dedupe by content 会保留两条 → 用户看到空消息气泡 + 满消息气泡两条 assistant。
    // 增强版 dedupe:同 role 下空文本被非空文本"压制" → 只保留满那条。
    const empty = msg('195', 'assistant', '');
    const full = msg('2ceMsx0IK3ABMHID', 'assistant', '目前资料库还没收录...');
    const result = dedupeMessagesByContent([empty, full]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2ceMsx0IK3ABMHID');
  });

  it('keeps empty-text message if it is the only one for that role', () => {
    const empty = msg('a', 'assistant', '');
    const result = dedupeMessagesByContent([empty]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('drops empty-text placeholder regardless of order', () => {
    const empty = msg('195', 'assistant', '');
    const full = msg('abc', 'assistant', '目前资料库...');
    const r1 = dedupeMessagesByContent([empty, full]);
    const r2 = dedupeMessagesByContent([full, empty]);
    expect(r1).toHaveLength(1);
    expect(r1[0].id).toBe('abc');
    expect(r2).toHaveLength(1);
    expect(r2[0].id).toBe('abc');
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
    // assistant 的两条中 empty 被同 role 非空"压制" → 只保留满的
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(result[0].id).toBe('eHvcXURT55jDoGha');
    expect(result[1].id).toBe('2ceMsx0IK3ABMHID');
  });
});