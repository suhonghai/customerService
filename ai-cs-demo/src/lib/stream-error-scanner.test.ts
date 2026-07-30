import { describe, it, expect } from 'vitest';
import { scanStreamError } from './stream-error-scanner';

describe('scanStreamError', () => {
  it('returns null when no assistant message', () => {
    expect(scanStreamError([], 'ready')).toBeNull();
  });

  it('returns null while streaming (not yet ready)', () => {
    const messages = [{ role: 'assistant', parts: [] }];
    expect(scanStreamError(messages, 'streaming')).toBeNull();
  });

  it('detects ORDER_NOT_FOUND from NOT_FOUND error output', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            type: 'dynamic-tool',
            toolName: 'get_user_order',
            state: 'output-available',
            output: {
              content: [{ type: 'text', text: '{"error":"NOT_FOUND","message":"订单号不存在"}' }],
            },
          },
        ],
      },
    ];
    const err = scanStreamError(messages, 'ready');
    expect(err).not.toBeNull();
    expect(err!.title).toMatch(/订单不存在/);
  });

  it('detects ORDER_API_DOWN from output-error state', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [{ type: 'tool-get_user_order', state: 'output-error', errorText: 'INTERNAL' }],
      },
    ];
    const err = scanStreamError(messages, 'ready');
    expect(err).not.toBeNull();
    expect(err!.title).toMatch(/订单/);
  });

  it('returns null when retrievalEmpty but order was OK (user asked order, not FAQ)', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-get_user_order',
            state: 'output-available',
            output: { content: [{ type: 'text', text: '{"orderId":1}' }] },
          },
        ],
        metadata: { retrieval: { results: [] } },
      },
    ];
    expect(scanStreamError(messages, 'ready')).toBeNull();
  });

  it('returns null when retrieval empty + AI hedges (KB has no exact FAQ, but AI still answers)', () => {
    // W11:faqEmptyError 检测已移除 — KB 有内容但检索不到具体场景时,
    // AI 自然基于通识回答,不弹"去上传"误导用户。详见 stream-error-scanner.ts 注释。
    const messages = [
      {
        role: 'assistant',
        parts: [{ type: 'text', text: '资料里没找到相关信息' }],
        metadata: { retrieval: { results: [] } },
      },
    ];
    expect(scanStreamError(messages, 'ready')).toBeNull();
  });
});
