/**
 * fix-009 — storedToUIMessage 的 metadata.reasoning 契约
 *
 * Why: 实现曾无条件 `{ ...baseMeta, reasoning }`,即使 reasoning='' 也写入 metadata,
 * 污染契约,让 `expect(ui.metadata).toEqual({ foo: 'bar' })` 这类严格断言失败。
 *
 * 契约(外部可观察,ChatView 用 `metadata?.reasoning || ''` 兜底消费):
 *   - 无 reasoning 来源(没有 reasoning-type part,也没有 lastChunkType 兜底):
 *     metadata 不该有 reasoning 键
 *   - 有 reasoning 来源(reasoning-type part 累加,或 lastChunkType 兜底):
 *     metadata.reasoning === 累加/兜底后的字符串
 *   - markInterrupted=true: 额外加 isInterrupted=true,不影响 reasoning 注入规则
 *
 * @status implemented
 */
import { describe, it, expect } from 'vitest';
import {
  storedToUIMessage,
  buildReasoningText,
} from '../../ai-cs-demo/src/lib/message-converter';
import type { StoredMessage } from '../../ai-cs-demo/src/lib/erp-admin-client';

function makeStored(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 1,
    sessionId: 100,
    role: 'assistant',
    content: '',
    parts: [{ type: 'text', text: 'hello' }],
    metadata: { foo: 'bar' },
    status: 1,
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('fix-009: storedToUIMessage metadata.reasoning 契约', () => {
  describe('Given StoredMessage 无 reasoning 来源', () => {
    describe('When 转换(parts 是普通 text,metadata 无 lastChunkType)', () => {
      it('Then metadata 不含 reasoning 键', () => {
        const ui = storedToUIMessage(
          makeStored({ parts: [{ type: 'text', text: 'hi' }] }),
          false,
        );
        expect('reasoning' in ui.metadata).toBe(false);
      });

      it('Then 其它 metadata 字段原样保留', () => {
        const ui = storedToUIMessage(
          makeStored({ parts: [{ type: 'text', text: 'hi' }] }),
          false,
        );
        expect(ui.metadata.foo).toBe('bar');
      });
    });

    describe('When 转换并 markInterrupted=true', () => {
      it('Then metadata 加 isInterrupted=true,且仍不含 reasoning 键', () => {
        const ui = storedToUIMessage(makeStored(), true);
        expect(ui.metadata.isInterrupted).toBe(true);
        expect('reasoning' in ui.metadata).toBe(false);
      });
    });
  });

  describe('Given StoredMessage 含 reasoning-type part', () => {
    describe('When 转换', () => {
      it('Then metadata.reasoning 等于该 part 的 text 累加', () => {
        const ui = storedToUIMessage(
          makeStored({
            parts: [
              { type: 'reasoning', text: 'thinking ' },
              { type: 'reasoning', text: 'hard' },
              { type: 'text', text: 'answer' },
            ],
          }),
          false,
        );
        expect(ui.metadata.reasoning).toBe('thinking hard');
      });
    });
  });

  describe('Given StoredMessage parts 空 + metadata.lastChunkType 标识中断阶段', () => {
    describe('When 转换', () => {
      it('Then metadata.reasoning 等于按 lastChunkType 拼的兜底文案', () => {
        const ui = storedToUIMessage(
          makeStored({ parts: [], metadata: { lastChunkType: 'reasoning-delta' } }),
          false,
        );
        expect(ui.metadata.reasoning).toBe('AI 正在思考时被中断');
      });

      it('Then tool-input-end lastChunkType 给出工具调用中断文案', () => {
        const ui = storedToUIMessage(
          makeStored({ parts: [], metadata: { lastChunkType: 'tool-input-end' } }),
          false,
        );
        expect(ui.metadata.reasoning).toBe('AI 正在调用工具时被中断');
      });
    });
  });

  describe('Given buildReasoningText 输入', () => {
    it('Then 未知 lastChunkType 返回通用兜底文案', () => {
      expect(buildReasoningText({ lastChunkType: 'whatever' })).toBe(
        'AI 已开始生成但未产出文本',
      );
    });

    it('Then 缺 lastChunkType 返回通用兜底文案', () => {
      expect(buildReasoningText({})).toBe('AI 已开始生成但未产出文本');
    });
  });
});