/**
 * @status draft
 * @change-id cs-round-008
 *
 * cs-round-008:切 session 闪烁 + 消息重复修复
 *
 * Why(为什么做):
 * 1. 闪烁:user 报告点 sidebar 切 session 时聊天区闪烁 2 次以上。
 *    根因有两层:
 *    - RAGChat 在 app/page.tsx 和 app/chat/[sessionId]/page.tsx 各自 mount,
 *      切 session 跨 route → useChat state 重置 → 视觉闪烁
 *    - 修复后:RAGChat 提到 (app)/layout.tsx,跨 route 共享 instance → 不重 mount。
 *      但仍有"内部 2 次 setMessages race":RAGChat 用 useEffect 从 localStorage
 *      同步加载消息(useEffect 是异步,paint 后才执行)→ paint 仍看到旧 session 的
 *      messages;同时 useChatState 用 useEffect 异步 fetch /history →
 *      150ms 后 setMessages(B.backend) → 第二次闪烁。
 * 2. 消息重复:user 报告 session BY6iyv34L0 出现 2 条 user "优惠券怎么用?" +
 *    1 空 assistant + 1 完整 assistant = 4 条 UI,但 backend cs_message 只有
 *    2 条(1 user + 1 assistant)。
 *    根因:useRealtime 的 onRecover callback(WS 重连补漏)用
 *    setMessages((prev) => [...prev, ...filtered]) append,dedupe 只按 id;
 *    客户端 AI SDK 生成 nanoid id(eHvcXURT55jDoGha),后端 cs_message 用
 *    numeric id(194),内容相同时按 id dedupe 失效 → 同内容消息被重复
 *    append 到 useChat state → write-back effect 持久化到 localStorage
 *    → 后续切换 / 刷新都看到污染。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1:切 session 聊天区不闪
 *     Given user 在 session A,聊天区显示 A 的 messages
 *     When user 点击 sidebar 切到 session B
 *     Then 浏览器只 paint 一次(显示 B 的 messages),不 paint 中间帧
 *          (不 paint 旧 A.messages,也不 paint B.backend 后再变)
 *
 *   Scenario 2:localStorage 加载时按 content dedupe(防御历史污染)
 *     Given localStorage cs_sessions_v1 里 session BY6iyv34L0 有
 *           4 条 messages(2 user 同内容不同 id + 2 assistant 不同内容)
 *     When user 进入该 session
 *     Then useChat 收到 dedupe 后的 messages(同内容 user 合并为 1 条)
 *          + sessions[B].messages 写回 localStorage(清掉污染版本)
 *
 *   Scenario 3:WS 重连补漏不重复 append
 *     Given useChat 已有 [user_nanoid, assistant_nanoid_full](AI SDK streaming 完成)
 *     When WS 重连触发 onRecover,refetch 返回 [user_194, assistant_195](后端 numeric id)
 *     Then useChat state = [user_nanoid, assistant_nanoid_full](不变),
 *          不 append 后端版本(同内容视为重复)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-008.spec.ts(纯前端 dedupe 逻辑,
 *      已有 use-chat-state.test.ts / dedupe-messages.test.ts / use-realtime.test.ts
 *      覆盖具体实现细节;本 spec 走 Given-When-Then 顶层契约验证)
 */

import { describe, it, expect } from 'vitest';
import { dedupeUIMessages, messageContentKey } from '@/lib/dedupe-messages';
import type { UIMessage } from 'ai';

function msg(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;
}

describe('cs-round-008: 切 session 闪烁 + 消息重复修复', () => {
  // ── Scenario 2:localStorage 加载时按 content dedupe ──
  describe('Given localStorage 污染(4 条混合 ID)', () => {
    const polluted = [
      msg('eHvcXURT55jDoGha', 'user', '优惠券怎么用?'), // nanoid
      msg('194', 'user', '优惠券怎么用?'), // numeric
      msg('195', 'assistant', ''), // 已知限制:空文本不合并
      msg('2ceMsx0IK3ABMHID', 'assistant', '目前资料库还没收录优惠券的使用说明'),
    ];

    describe('When dedupeMessagesByContent 过滤', () => {
      it('Then user 两条同内容合并为 1 条(保留首次)', () => {
        const result = dedupeUIMessages(polluted);
        const userMsgs = result.filter((m) => m.role === 'user');
        expect(userMsgs).toHaveLength(1);
        expect(userMsgs[0].id).toBe('eHvcXURT55jDoGha');
      });

      it('Then 整体长度 < 4(去掉至少 1 条 user 重复)', () => {
        const result = dedupeUIMessages(polluted);
        expect(result.length).toBeLessThan(4);
        expect(result.length).toBeGreaterThanOrEqual(2); // 至少保留 1 user + assistant
      });
    });
  });

  // ── Scenario 3:WS 重连补漏按 content dedupe ──
  describe('Given useChat 已有 nanoid 消息', () => {
    const existing = [
      msg('eHvcXURT55jDoGha', 'user', '优惠券怎么用?'),
      msg('abc_nanoid_xyz', 'assistant', '目前资料库...'),
    ];

    describe('When WS 重连返回后端 numeric id 同内容消息', () => {
      const recovered = [
        msg('194', 'user', '优惠券怎么用?'), // 同 user 内容
        msg('195', 'assistant', '目前资料库...'), // 同 assistant 内容
      ];

      it('Then dedupe 后只剩原 2 条(后端版本被识别为重复)', () => {
        const result = dedupeUIMessages([...existing, ...recovered]);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('eHvcXURT55jDoGha'); // 保留 nanoid
        expect(result[1].id).toBe('abc_nanoid_xyz');
      });

      it('Then messageContentKey 对 nanoid 与 numeric 同内容返回相同 key', () => {
        const k1 = messageContentKey(existing[0]);
        const k2 = messageContentKey(recovered[0]);
        expect(k1).toBe(k2);
      });
    });
  });

  // ── 反向:dedupe 不应误伤不同内容 ──
  describe('Given 不同内容消息', () => {
    const messages = [
      msg('a', 'user', 'q1'),
      msg('b', 'user', 'q2'),
      msg('c', 'assistant', 'a1'),
      msg('d', 'assistant', 'a2'),
    ];

    describe('When dedupeMessagesByContent', () => {
      it('Then 全部保留(无 false positive)', () => {
        const result = dedupeUIMessages(messages);
        expect(result).toHaveLength(4);
      });
    });
  });
});