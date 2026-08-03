/**
 * 后端 StoredMessage → useChat UIMessage(供前端显示用)。
 *
 * 后端存的是扁平的 { content, parts, metadata, status, ... },
 * useChat(AI SDK 6.x)期望的是 { id, role, parts, metadata } 的 UI message。
 * 这里把 parts / content / metadata 三种来源归一化到 useChat 能消费的形态。
 *
 * markInterrupted 用来标记"最后一条 assistant 如果被中止"的元数据,
 * 这样前端可以直接展示"继续生成"按钮而无需再去后端查 status 字段。
 */

import type { StoredMessage } from '@/lib/erp-admin-client';

/** useChat 6.x UIMessage.parts 的最小结构 (message-converter 只访问这些字段) */
export interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** useChat 6.x 用的 UIMessage shape(只用到的字段) */
export interface UIMessageLike {
  id: string;
  role: string;
  parts: MessagePart[];
  metadata: Record<string, unknown>;
}

/** 根据最后一种 stream chunk 类型,拼一段 "AI 正在 X 时被中断" 的中文文案。 */
export function buildReasoningText(meta: Record<string, unknown>): string {
  const t = meta.lastChunkType;
  if (typeof t !== 'string') return 'AI 已开始生成但未产出文本';
  if (t === 'tool-input-end' || t === 'tool-result') return 'AI 正在调用工具时被中断';
  if (t === 'reasoning-end' || t === 'reasoning-delta') return 'AI 正在思考时被中断';
  return 'AI 已开始生成但未产出文本';
}

export function storedToUIMessage(m: StoredMessage, markInterrupted: boolean): UIMessageLike {
  const rawParts: MessagePart[] = Array.isArray(m.parts)
    ? (m.parts as unknown as MessagePart[])
    : m.content
      ? [{ type: 'text', text: m.content }]
      : [];

  // 提取 reasoning(独立字段,不让 ChatView 误以为是 text)
  // W11 fix:tool-* / dynamic-tool part 补 state='output-available' + providerExecuted=true,
  //   否则 useChat 把 messages 发回去时,服务端 AI SDK 6.x convertToModelMessages 看到
  //   「无 result 的孤儿 tool-call」→ AI_MissingToolResultsError → AI_NoOutputGeneratedError。
  //   仅当 part 已有 output 时补(无 output = 真·未完成,不冒充完成)。
  let reasoning = '';
  const textParts: MessagePart[] = [];
  for (const p of rawParts) {
    if (p.type === 'reasoning') {
      reasoning += p.text || '';
    } else if (
      typeof p.type === 'string' &&
      (p.type.startsWith('tool-') || p.type === 'dynamic-tool') &&
      p.output != null &&
      p.state === undefined
    ) {
      textParts.push({ ...p, state: 'output-available', providerExecuted: true });
    } else {
      textParts.push(p);
    }
  }
  // parts 算完后还空,且后端记录的最后 chunk 类型能定位"AI 在哪个阶段被中断" → 塞 reasoning 兜底
  const baseMeta: Record<string, unknown> =
    m.metadata && typeof m.metadata === 'object'
      ? { ...(m.metadata as Record<string, unknown>) }
      : {};
  if (textParts.length === 0 && !reasoning && typeof baseMeta.lastChunkType === 'string') {
    reasoning = buildReasoningText(baseMeta);
  }
  // 仅当 reasoning 真有内容时才注入 metadata;否则保持原 metadata 干净(避免污染契约)
  const metadata: Record<string, unknown> = markInterrupted
    ? { ...baseMeta, ...(reasoning ? { reasoning } : {}), isInterrupted: true }
    : { ...baseMeta, ...(reasoning ? { reasoning } : {}) };
  return {
    id: String(m.id),
    role: m.role,
    parts: textParts,
    metadata,
  };
}
