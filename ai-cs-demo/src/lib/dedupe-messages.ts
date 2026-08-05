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
 *
 * 第二轮增强(2026-08-05):处理"空文本占位 vs 非空完整"对
 * - localStorage 历史污染可能出现 a_195(后端 numeric id,parts=[])和 a_nanoid(客户端 id,parts=full)
 *   共存,按 (role, text) 严格 dedupe 两者内容不同(空 vs 满)→ 两条都保留 → 用户看到空消息气泡
 * - 增强版 dedupe:如果同 role 下某条消息 text 为空、另一条同 role 消息 text 非空,
 *   保留非空那条(空那条通常是未完成/中断的占位)
 * - 注意:这要求 dedupe 时能看到全局的同 role 消息,两遍扫描
 */

interface MessageLike {
  id?: string;
  role: string;
  parts?: Array<{ type?: string; text?: string }>;
}

function getMessageText(m: MessageLike): string {
  return (m.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');
}

/**
 * 消息的"语义 key":role + 所有 text part 拼接。
 * AI SDK 6.x message.parts 可能是 [{type:'text', text:'...'}, {type:'reasoning', text:'...'},
 * {type:'tool-XXX', input:..., output:...}],我们只取 text part(忽略 reasoning /
 * tool part 的内部结构)— 对聊天消息足够区分。
 */
export function messageContentKey(m: MessageLike): string {
  return `${m.role}:${getMessageText(m)}`;
}

/**
 * 按 content key 去重,保留第一次出现的消息(顺序保持)。
 * 返回新数组(不修改入参)。
 *
 * 增强:如果两条消息 role 相同,且一条 text 为空另一条非空,保留非空那条。
 * 例:[a(empty), a(full), u1] → [a(full), u1](空 a 被丢弃,不再产生空消息气泡)。
 *
 * 不变式:
 * - 顺序保持(第一次出现的索引优先)
 * - 同 content 的两条完全相同消息只保留第一条
 * - 同 role 不同 content 的两条都保留(除非一条空一条非空,此时保留非空)
 */
export function dedupeMessagesByContent<T extends MessageLike>(messages: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const m of messages) {
    const key = messageContentKey(m);
    const text = getMessageText(m);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(m);
  }
  // 第二轮:消除"空文本占位 vs 非空完整"对
  // 找出所有"role + 是否有非空 text"的索引,然后丢弃同 role 中 text 为空的(如果存在非空的)
  const hasNonEmptyByRole = new Map<string, boolean>();
  for (const m of result) {
    const text = getMessageText(m);
    if (text.length > 0) hasNonEmptyByRole.set(m.role, true);
  }
  const filtered = result.filter((m) => {
    const text = getMessageText(m);
    if (text.length === 0 && hasNonEmptyByRole.get(m.role)) {
      // 空文本 + 同 role 有非空 → 丢弃空占位
      return false;
    }
    return true;
  });
  return filtered;
}

/** 兜底:UIMessage[] → 去重 → UIMessage[](供 React 状态用) */
export function dedupeUIMessages(messages: UIMessage[]): UIMessage[] {
  return dedupeMessagesByContent(messages);
}