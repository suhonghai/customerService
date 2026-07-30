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
 * 把后端 StoredMessage[] 转回 useChat 用的 UIMessage[],并标记
 * "最后一条 assistant 如果 status 2/3"为中断。
 *
 * 用 ref 包装好让 useRealtime / 流式完成的 effect 复用。
 */
export function refetchSessionHistory(sid: number): Promise<UIMessage[]> {
  return (async () => {
    const res = await fetch(`/api/sessions/${sid}/history`);
    if (!res.ok) return [];
    const json = await res.json();
    const stored: StoredMessage[] = Array.isArray(json.messages) ? json.messages : [];
    let lastAssistantIdx = -1;
    for (let i = stored.length - 1; i >= 0; i--) {
      if (stored[i].role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }
    return stored.map((m, i) => {
      const interrupted = i === lastAssistantIdx && (m.status === 2 || m.status === 3);
      const baseMeta = m.metadata && typeof m.metadata === 'object' ? { ...m.metadata } : {};
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
  })();
}
