import { describe, it, expect } from 'vitest';
import { storedToUIMessage } from './message-converter';
import type { StoredMessage } from './erp-admin-client';

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

describe('storedToUIMessage', () => {
  it('converts an assistant message with parts', () => {
    const ui = storedToUIMessage(
      makeStored({ id: 7, role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }),
      false,
    );
    expect(ui.id).toBe('7');
    expect(ui.role).toBe('assistant');
    expect(ui.parts).toEqual([{ type: 'text', text: 'hi' }]);
    expect(ui.metadata).toEqual({ foo: 'bar' });
  });

  it('marks interruption when requested', () => {
    const ui = storedToUIMessage(makeStored(), true);
    expect(ui.metadata.isInterrupted).toBe(true);
    // 其它 metadata 字段保留
    expect(ui.metadata.foo).toBe('bar');
  });

  it('falls back to wrapping content in text part when parts is missing', () => {
    const ui = storedToUIMessage(
      makeStored({
        parts: undefined as unknown as StoredMessage['parts'],
        content: 'plain content',
      }),
      false,
    );
    expect(ui.parts).toEqual([{ type: 'text', text: 'plain content' }]);
  });

  it('returns empty parts array when both parts and content are missing', () => {
    const ui = storedToUIMessage(
      makeStored({ parts: undefined as unknown as StoredMessage['parts'], content: '' }),
      false,
    );
    expect(ui.parts).toEqual([]);
  });

  // W11 fix:服务端 stream chunk 落库时 tool part 没有 state/providerExecuted 字段,
  // storedToUIMessage raw 透传会导致 AI SDK 6.x convertToModelMessages 看到「孤儿 tool-call」
  // → AI_MissingToolResultsError → AI_NoOutputGeneratedError。补这两个字段后才能被识别成
  // 已完成的 tool-call,前端 send 时不会让服务端报 AI_NoOutput。
  describe('tool parts from DB need state + providerExecuted', () => {
    it('injects state=output-available on tool-* part that already has output', () => {
      const ui = storedToUIMessage(
        makeStored({
          id: 99,
          role: 'assistant',
          parts: [
            {
              type: 'tool-get_active_orders',
              toolCallId: 'call_abc',
              toolName: 'get_active_orders',
              input: {},
              output: { content: [{ text: '[]', type: 'text' }], isError: false },
              dynamic: true,
            },
            { type: 'text', text: '好的,您有 0 单' },
          ],
        }),
        false,
      );
      const toolPart = ui.parts.find((p) => p.type === 'tool-get_active_orders');
      expect(toolPart).toBeDefined();
      expect(toolPart?.state).toBe('output-available');
      expect(toolPart?.providerExecuted).toBe(true);
      // text part 不受影响
      expect(ui.parts.find((p) => p.type === 'text')).toEqual({
        type: 'text',
        text: '好的,您有 0 单',
      });
    });

    it('injects state on dynamic-tool type too', () => {
      const ui = storedToUIMessage(
        makeStored({
          parts: [
            {
              type: 'dynamic-tool',
              toolCallId: 'call_xyz',
              toolName: 'search_faq',
              input: { query: '退款' },
              output: { content: [{ text: '{}', type: 'text' }], isError: false },
            },
          ],
        }),
        false,
      );
      const toolPart = ui.parts[0];
      expect(toolPart.state).toBe('output-available');
      expect(toolPart.providerExecuted).toBe(true);
    });

    it('does NOT inject state on tool part without output (orphan / in-flight)', () => {
      // 没有 output 的 tool part 是真·未完成,不应该被误标成 output-available
      // 否则会让 AI SDK 把没跑完的工具当成已完成的喂给 LLM
      const ui = storedToUIMessage(
        makeStored({
          parts: [
            { type: 'tool-get_user_order', toolCallId: 'call_pending', input: { orderId: 'X' } },
          ],
        }),
        false,
      );
      const toolPart = ui.parts[0];
      expect(toolPart.state).toBeUndefined();
      expect(toolPart.providerExecuted).toBeUndefined();
    });
  });
});
