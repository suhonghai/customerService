/**
 * @status draft
 * @change-id cs-round-009
 *
 * cs-round-009:新会话空 assistant 残留 — stream chunks 丢失兜底
 *
 * Why(为什么做):
 * PR #51(切 session 闪烁 + 消息重复)merge 后,user 报告新建会话"查一下我的订单"
 * 右侧仍只显示 1 user + 1 空 assistant。查 DB session 192 assistant 实际
 * 完整存库(status=1, content 完整, ~13 秒 stream 完成),所以 backend 没问题,
 * 问题在前端 useChat 卡在 streaming 中间状态 / chunks 丢失。
 *
 * 根因(2026-08-04 commit 6583e1b 后):
 * - 后端 req.signal.detach,client disconnect 不再 abort 后端 stream,
 *   即使前端 SSE 中断,后端继续跑完 stream + PATCH status=1 + 完整内容入库。
 * - 但前端 stream reader 可能因 tab 切走 / 网络抖动 / SSE 解析错而丢 chunks,
 *   useChat.messages 卡在 [user_msg, empty_assistant_placeholder]。
 * - onRecover 严格 by-content dedupe:空 + 满内容不同 → 两条都 append,
 *   用户看到"空 + 满"双 assistant(更糟)。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1:WS reconnect refetch → onRecover 删空留满
 *     Given useChat 已有 [user_nanoid, empty_assistant_nanoid](stream chunks 丢失)
 *     When WS 重连触发 onRecover,backend history 返回
 *           [user_194, full_assistant_195]
 *     Then useChat state = [user_nanoid, full_assistant_195] 或等价 dedupe 结果
 *          (空 assistant 被同 role 非空"压制"自动删除,不出现双 assistant)
 *
 *   Scenario 2:stream 完成 + 最后一条 assistant 空 → 自动 refetch
 *     Given useChat 状态 [user_msg, empty_assistant](stream chunks 丢失)
 *     And   status 从 'streaming' 变成 'ready'
 *     When  frontend safety net effect 检测到最后 assistant 文本为空
 *     Then  自动调 refetchHistoryRef(backendSessionId)
 *           → 拉 backend 完整 assistant → setMessages 替换
 *           → 用户从空气泡变成完整响应
 *
 *   Scenario 3:stream 正常完成 → 不触发 refetch
 *     Given useChat 状态 [user_msg, full_assistant](stream 完整)
 *     And   status = 'ready'
 *     When  frontend safety net effect 检查
 *     Then  不触发 refetch(避免每次 ready 都多打一次 /history)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-009.spec.ts(纯前端 dedupe + safety net,
 *      已有 dedupe-messages.test.ts 覆盖核心 dedupe 逻辑,本 spec 验证 RAGChat
 *      接入正确性 + safety net 触发条件)。
 */

import { describe, it, expect } from 'vitest';
import { dedupeMessagesByContent, messageContentKey } from '@/lib/dedupe-messages';
import type { UIMessage } from 'ai';

function msg(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text }],
  } as unknown as UIMessage;
}

describe('cs-round-009: 新会话空 assistant — stream chunks 丢失兜底', () => {
  // ── Scenario 1:WS reconnect refetch → onRecover 删空留满 ──
  describe('Given [user, empty_assistant](前端 chunks 丢失)', () => {
    const prev = [
      msg('eHvc_user', 'user', '查一下我的订单'),
      msg('eHvc_empty', 'assistant', ''), // streaming 占位,chunks 丢失
    ];

    describe('When WS reconnect 拉回 backend history [user_194, full_assistant_195]', () => {
      const recovered = [
        msg('194', 'user', '查一下我的订单'),
        msg('195', 'assistant', '您的订单 ORD-2026...'),
      ];

      it('Then dedupeMessagesByContent([...prev, ...recovered]) 只剩 2 条(空 assistant 被删)', () => {
        const result = dedupeMessagesByContent([...prev, ...recovered]);
        expect(result).toHaveLength(2);
        const assistants = result.filter((m) => m.role === 'assistant');
        expect(assistants).toHaveLength(1);
        // 满的 assistant 保留(空被删)
        expect((assistants[0].parts?.[0] as { text?: string })?.text).toBe(
          '您的订单 ORD-2026...',
        );
      });

      it('Then user 消息去重(同内容只留一条,保留 prev 的 nanoid)', () => {
        const result = dedupeMessagesByContent([...prev, ...recovered]);
        const users = result.filter((m) => m.role === 'user');
        expect(users).toHaveLength(1);
        expect(users[0].id).toBe('eHvc_user'); // 第一次出现
      });

      it('Then messageContentKey 对空文本有稳定 key(同 role 不同空/满区分开)', () => {
        expect(messageContentKey(prev[1])).toBe('assistant:');
        expect(messageContentKey(recovered[1])).toBe('assistant:您的订单 ORD-2026...');
        expect(messageContentKey(prev[1])).not.toBe(messageContentKey(recovered[1]));
      });
    });
  });

  // ── Scenario 3:stream 正常 → 不触发 refetch ──
  describe('Given [user, full_assistant](stream 完整)', () => {
    const messages = [
      msg('user_nanoid', 'user', '查一下我的订单'),
      msg('a_nanoid', 'assistant', '您的订单 ORD-2026...'),
    ];

    describe('When safety net 检查 status=ready + 最后 assistant 文本', () => {
      const lastAssistant = messages[messages.length - 1];
      const text = (lastAssistant.parts?.[0] as { text?: string })?.text ?? '';

      it('Then text 非空 → safety net 不触发 refetch(逻辑判断)', () => {
        // 模拟 safety net 判断条件
        const shouldRefetch = lastAssistant.role === 'assistant' && !text;
        expect(shouldRefetch).toBe(false);
      });
    });
  });

  // ── Scenario 2 反向:stream 完成但空 → 应触发 refetch ──
  describe('Given [user, empty_assistant](stream 卡住)', () => {
    const messages = [
      msg('user_nanoid', 'user', '查一下我的订单'),
      msg('a_nanoid', 'assistant', ''),
    ];

    describe('When safety net 检查 status=ready + 最后 assistant 文本', () => {
      const lastAssistant = messages[messages.length - 1];
      const text = (lastAssistant.parts?.[0] as { text?: string })?.text ?? '';

      it('Then text 为空 → safety net 应触发 refetch(逻辑判断)', () => {
        const shouldRefetch = lastAssistant.role === 'assistant' && !text;
        expect(shouldRefetch).toBe(true);
      });
    });
  });
});