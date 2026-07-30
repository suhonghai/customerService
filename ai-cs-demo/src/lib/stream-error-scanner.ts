'use client';

import { orderApiDownError, orderNotFoundError, type UserFacingError } from '@/lib/errors';

/**
 * StreamMessage 是 scanStreamError 实际访问的最小字段集 (AI SDK 6.x UIMessage 结构子集).
 * 不引入完整 UIMessage<T> 是因为 scanStreamError 是 structure-based scanner,
 * 只读 role/parts/metadata 三个字段, 对 TOOLS/DATA_PARTS 不关心.
 */
interface StreamMessage {
  role: string;
  parts?: StreamPart[];
  metadata?: {
    retrieval?: { results?: unknown[] };
  };
}

interface StreamPart {
  type: string;
  toolName?: string;
  state?: string;
  output?: unknown;
  text?: string;
  errorText?: string;
}

/**
 * 扫最后一条 assistant 消息的 parts,识别 3 类客服专用错误:
 * - ORDER_NOT_FOUND:get_user_order 返 {error:"NOT_FOUND"} — 最高优先级
 * - ORDER_API_DOWN:get_user_order 抛错或返 {error:"INTERNAL"}
 * - FAQ_EMPTY:RAG 检索空 + AI 答"没找到/没收录" + 没有订单结果
 *
 * 返回 null 表示没扫到客服专用错误(交给 useChat.error / ErrorBubble 兜底)。
 */
export function scanStreamError(messages: StreamMessage[], status: string): UserFacingError | null {
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!last || status === 'submitted' || status === 'streaming') return null;

  const parts = last.parts ?? [];
  const isOrderPart = (p: StreamPart) =>
    p.type === 'tool-get_user_order' ||
    (p.type === 'dynamic-tool' && p.toolName === 'get_user_order');
  const orderParts = parts.filter(isOrderPart);
  const out = (p: StreamPart): string => {
    const o = p.output;
    if (typeof o === 'string') return o;
    if (o === undefined || o === null) return '';
    try {
      return JSON.stringify(o);
    } catch {
      return '';
    }
  };

  const notFound = orderParts.find(
    (p: StreamPart) =>
      p.state !== 'output-error' &&
      /\\?"error\\?":\s*\\?"NOT_FOUND\\?"|订单号.*不存在|订单.*不存在/i.test(out(p)),
  );
  if (notFound) return orderNotFoundError({ part: notFound, message: '订单不存在' });

  const apiDown = orderParts.find(
    (p: StreamPart) =>
      p.state === 'output-error' ||
      /\\?"error\\?":\s*\\?"INTERNAL\\?"|get_user_order[\s\S]{0,500}INTERNAL|订单.*系统.*异常/i.test(
        out(p),
      ),
  );
  if (apiDown) return orderApiDownError({ part: apiDown, message: '订单 API 异常' });

  const meta = last.metadata;
  const retrievalEmpty =
    Array.isArray(meta?.retrieval?.results) && meta.retrieval.results.length === 0;
  const text = parts
    .filter((p: StreamPart) => p.type === 'text')
    .map((p: StreamPart) => p.text ?? '')
    .join('');
  const hasOrderOk = parts.some(
    (p: StreamPart) =>
      isOrderPart(p) &&
      p.state === 'output-available' &&
      !/\\?"error\\?":\s*\\?"INTERNAL\\?"/.test(out(p)) &&
      !/\\?"isError\\?":\s*true/i.test(out(p)),
  );
  // W11:faqEmptyError 检测移除 — KB 里没具体 FAQ 内容时,AI 自然会基于通识回答
  // (如"普通快递 1-3 天"),不需要弹错误气泡 + "去上传"按钮误导用户以为 KB 整个空的。
  // 兜底交给 ErrorBubble 在 useChat.error 真·失败时展示即可。
  void retrievalEmpty;
  void text;
  void hasOrderOk;
  void notFound;
  return null;
}
