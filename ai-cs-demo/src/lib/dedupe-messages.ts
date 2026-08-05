import type { UIMessage } from 'ai';

/**
 * dedupe-messages:按消息内容(角色 + 文本)去重,解决"客户端 nanoid id + 后端 numeric id"
 * 同一消息并存导致 useChat state / localStorage 污染的问题。
 *
 * 背景:
 * - 客户端 useChat 内部给每条 message 生成 nanoid id(形如 "eHvcXURT55jDoGha")
 * - 后端 cs_message 用自增数字主键(形如 "194", "195")
 * - WS reconnect refetch 会返回后端版本,如果按 id dedupe,会重复 append 同内容消息
 * - 旧 dedupe-by-id 实现留下了 bug:切 session / WS 重连 / 离线刷新 后,UI 出现重复消息
 *
 * 替代方案对比:
 * - 按 id dedupe:nanoid 与 numeric id 不同,失效
 * - 按 (role, position) dedupe:消息位置会变(append 后),脆弱
 * - 按 (role, text) dedupe:语义上"两条相同文本 = 同一条",对聊天场景足够。
 *   风险:用户发两次完全相同的话会被合并。chat 场景里罕见,trade-off 可接受。
 *
 * 用法:
 * - RAGChat load from localStorage:dedupe 后 setMessages
 * - useRealtime onRecover(WS 重连补漏):dedupe 后 append
 */

interface MessageLike {
  role: string;
  parts?: Array<{ type?: string; text?: string }>;
}

/**
 * 消息的"语义 key":role + 所有 text part 拼接。
 * AI SDK 6.x message.parts 可能是 [{type:'text', text:'...'}, {type:'reasoning', text:'...'},
 * {type:'tool-XXX', input:..., output:...}],我们只取 text part(忽略 reasoning /
 * tool part 的内部结构)— 对聊天消息足够区分。
 */
export function messageContentKey(m: MessageLike): string {
  const text = (m.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
  return `${m.role}:${text}`;
}

/**
 * 按 content key 去重,保留第一次出现的消息(顺序保持)。
 * 返回新数组(不修改入参)。
 */
export function dedupeMessagesByContent<T extends MessageLike>(messages: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const m of messages) {
    const key = messageContentKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  return result;
}

/** 兜底:UIMessage[] → 去重 → UIMessage[](供 React 状态用) */
export function dedupeUIMessages(messages: UIMessage[]): UIMessage[] {
  return dedupeMessagesByContent(messages);
}