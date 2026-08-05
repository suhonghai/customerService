'use client';

import type { UIMessage } from 'ai';
import type { StoredMessage } from '@/lib/erp-admin-client';

/** StoredMessage.parts 的最小结构 (refetch-history 只访问这些字段) */
interface StoredPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * cs-round-012:从后端 StoredMessage[] 转回 useChat 用的 UIMessage[]
 * 纯函数(无 fetch)— refetchSessionHistory / use-chat-state 都复用同一份状态分发。
 *
 * 按最后一条消息的 status 分发(cs-round-011):
 *  - status=1 (complete) → 直接渲染完整内容
 *  - status=2 (streaming) → 渲染已有 partial + isStreaming + continueFromMessageId
 *    metadata,前端自动订阅续推接口把后续 chunk append 到同一条 message 上
 *  - status=3 (interrupted) → 标记 isInterrupted,前端显示「继续生成」按钮
 *  - status=4 (error) → 渲染已有 partial + isError + continueFromMessageId,
 *    前端显示「重新生成」按钮
 *
 * 关键(csr011):status=2 的空占位仍然要产出 UIMessage(parts=[{type:'text',
 * text:''}]),不能跳过 — 跳过会被 ChatView 过滤,失去「自动续推」的起点。
 */
export function storedToUIMessages(stored: StoredMessage[]): UIMessage[] {
  let lastAssistantIdx = -1;
  for (let i = stored.length - 1; i >= 0; i--) {
    if (stored[i].role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }
  return stored.map((m, i) => {
    const isLastAssistant = i === lastAssistantIdx;
    const baseMeta: Record<string, unknown> =
      m.metadata && typeof m.metadata === 'object'
        ? { ...(m.metadata as Record<string, unknown>) }
        : {};
    // cs-round-011:状态分发
    // status=2 streaming → 标 isStreaming + continueFromMessageId
    if (m.role === 'assistant' && m.status === 2) {
      return {
        id: String(m.id),
        role: m.role,
        // 即使 content 空,也产出 parts=[{type:'text', text:''}],保证 ChatView 不被过滤
        parts: Array.isArray(m.parts)
          ? (m.parts as unknown as StoredPart[])
          : [{ type: 'text', text: m.content || '' }],
        metadata: {
          ...baseMeta,
          isStreaming: true,
          continueFromMessageId: m.id,
        },
      } as unknown as UIMessage;
    }
    // status=4 error → 标 isError + continueFromMessageId + 错误副标题
    if (m.role === 'assistant' && m.status === 4) {
      const rawErrMsg = baseMeta['errorMessage'];
      const errorMessage = typeof rawErrMsg === 'string' ? rawErrMsg : undefined;
      return {
        id: String(m.id),
        role: m.role,
        parts: Array.isArray(m.parts)
          ? (m.parts as unknown as StoredPart[])
          : m.content
            ? [{ type: 'text', text: m.content }]
            : [],
        metadata: {
          ...baseMeta,
          isError: true,
          continueFromMessageId: m.id,
          errorMessage,
        },
      } as unknown as UIMessage;
    }
    // status=2/3 老逻辑:仅最后一条 assistant 标 isInterrupted(继续生成按钮)
    const interrupted = isLastAssistant && (m.status === 2 || m.status === 3);
    return {
      id: String(m.id),
      role: m.role,
      parts: Array.isArray(m.parts)
        ? (m.parts as unknown as StoredPart[])
        : m.content
          ? [{ type: 'text', text: m.content }]
          : [],
      metadata: interrupted ? { ...baseMeta, isInterrupted: true } : baseMeta,
    } as unknown as UIMessage;
  });
}

/**
 * 拉取会话所有消息并转 UIMessage[]。
 * 内部 fetch + 复用 storedToUIMessages。useRealtime / RAGChat 还在用这个包装。
 */
export function refetchSessionHistory(sid: number): Promise<UIMessage[]> {
  return (async () => {
    const res = await fetch(`/api/sessions/${sid}/history`);
    if (!res.ok) return [];
    const json = await res.json();
    const stored: StoredMessage[] = Array.isArray(json.messages) ? json.messages : [];
    return storedToUIMessages(stored);
  })();
}
