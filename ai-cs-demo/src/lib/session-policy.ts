import type { UIMessage } from 'ai';
import type { Session } from '@/hooks/use-sessions';

/**
 * 「+ 新会话」按钮该不该真建新会话的策略。
 *
 * 业界惯例(ChatGPT / Claude.ai):当前 active 会话已经是空的话,
 *   再点 "+ 新会话" 是 no-op — 已经在新壳了,再造一个只会污染侧栏。
 *
 * 用户场景:
 * - 当前没会话(activeId=null,刚删完或首次进入)→ 必须建(true)
 * - 当前 active 有消息(用户在有内容的会话里想换新)→ 建(true)
 * - 当前 active 是空(已经在新壳,刚点过 / 切到空会话)→ 不建(false)
 *
 * **关键**:`activeMessages` 必须是 `useSessions().activeSession?.messages`
 *   而不是 `useChat().messages`!后者在 activeId 切换后还有 1-2 帧延迟才被
 *   page.tsx effect 清空,期间用户连点会看到「老会话的消息」被当作
 *   「新会话有内容」误判 true,造成连续创建空壳。activeSession.messages
 *   跟着 sessions 数组同步更新(createSession 时 sessions 被 prepend,
 *   activeSession.find() 立即指向新空壳),无 timing window。
 */
export function shouldCreateNewSession(
  activeId: string | null,
  activeMessages: UIMessage[],
): boolean {
  if (activeId == null) return true;
  return activeMessages.length > 0;
}

/**
 * 「+ 新会话」reuse 策略:sidebar 里如果已经有别的空会话(非 active),
 *   直接返回那个,避免每点一次都新建一个空壳污染侧栏。
 *
 * 5 个 case(S1 vitest):
 * - sessions=[] → null(没东西可复用,交给上层 create)
 * - sessions=[A非空, B空], activeId=A → B(找到空就跳过去)
 * - sessions=[A空, B非空], activeId=B → A(顺序无关)
 * - sessions=[A空], activeId=A → null(已经在那,不再点)
 * - sessions=[A空], activeId=null → A(首次进入要 activate 这个空)
 *
 * 关键:activeId=null 是合法情形 — store 首次 load 完 sessions 还没
 *   activate 任何一个,这时点 + 应跳到 sidebar 里已有的空会话(如果有),
 *   而不是再造一个空壳。
 */
export function findReusableEmptySession(
  sessions: Session[],
  activeId: string | null,
): Session | null {
  return sessions.find((s) => s.id !== activeId && s.messages.length === 0) ?? null;
}
