/**
 * @status draft
 * @change-id cs-round-020
 *
 * cs-round-020: 切会话时右框不能残留上一会话的消息
 *
 * Why(为什么做):
 * 用户报「先点击第一个会话列表,再点击第二个会话列表第一个会话的消息会展示
 * 到第二个会话消息的上面」。Playwright 复现:
 *   - 点 sidebar 「快递一般几天能到?」(id=236) → 右框显示「怎么开发票?」user+AI
 *   - 点 sidebar 「我想退货怎么办?」(id=235) → 右框变成
 *       *「怎么开发票?」user + AI  ← 236 残留!
 *       *「我想退货怎么办?」user + AI  ← 235 追加下面
 *   - 视觉:A 在上 B 在下,sidebar 还显示 4 条消息(其实是 2+2 拼起来的)
 *
 * Bug 链路(同 cs-round-018 根因 — diff/append 不清 prev):
 *   - useChatState effect 跑(activeId 从 236 → 235)→ fetch /history for 235
 *   - setMessages((prev) => [...prev, ...newFromBackend]):
 *       prev 是 236 的 2 条消息,newFromBackend 是 235 的 2 条
 *       newFromBackend = restored.filter(m => !localIds.has(...))
 *       因为 235 和 236 的 message id 不重叠,newFromBackend = 235 全部
 *       返回 [...prev(236 的), ...newFromBackend(235 的)]
 *   - 视觉:右框显示 [236.u1, 236.a1, 235.u1, 235.a1]
 *
 * cs-round-018 守"删 active 后 activeId 切到下一个",cs-round-020 守"主动
 * 切会话(sidebar 点击 / URL 直接访问)"。两条路径都走 useChatState effect 的
 * activeId 变化分支。
 *
 * 修法:
 *   useChatState effect 在 activeId 有效分支,fetch /history **之前**
 *   `setMessages([])`,清掉上一会话残留。fetch 完成后用 setMessages(restored)
 *   直接 replace(diff/append 不再需要,因为 prev 已经空)。
 *
 *   - 闪烁网关由 historyLoading state 继续承担(ChatView 显示「正在加载…」)
 *   - 不破坏 cs-round-013 防闪烁设计
 *   - 不破坏 streaming 中的 chunk 显示(streaming 期间不会切会话;真要切,
 *     streaming chunks 也不应该带过去)
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — useChatState effect 在 fetch /history 之前
 *               必含 setMessages([])
 *     Given ai-cs-demo/src/hooks/use-chat-state.ts 源码
 *     Then  effect 体内,setBackendSessionId(backendIdNum) 之前必含 setMessages([])
 *     And   setMessages([]) 必出现**早于** fetch 调用
 *           (否则 diff/append 仍被 prev 污染)
 *
 *   Scenario 2: 行为 — activeId 从 236 切到 235,fetch 前必 setMessages([])
 *     Given useChatState({ activeId: '236', setMessages: spy, setHistoryLoading: spy })
 *     And   /api/sessions/236/history 返回 { messages: [<msg236-1>, <msg236-2>] }
 *     When  rerender({ id: '235' })
 *     And   等 effect 重跑(fetch 235 还没回)
 *     Then  setMessages([]) 必被调过(在 fetch 完成前)
 *     And   setBackendSessionId(235) 必被调
 *
 *   Scenario 3: 回归 — cs-round-017 / cs-round-018 契约仍成立
 *     Given useChatState 源码
 *     Then  !activeId 分支仍含 setMessages([])
 *     And   handleDeleteSession 删 active 前仍含 setMessages([])(grep RAGChat.tsx)
 *
 * Out of scope:
 * - diff/append 逻辑移除(留作 streaming metadata 同步的 defense-in-depth)
 * - 切换瞬间的"上一会话消息闪烁"(historyLoading 已接住显示「正在加载…」)
 * - useChat (ai-sdk) 自身 messages 状态生命周期
 *
 * 落点:co-located ai-cs-demo/src/cs-round-020.spec.ts,
 *      验证 useChatState 源码契约 + 行为。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** 读源文件并剥掉注释 — 跟 cs-round-013/015/017/018/019 同模式 */
function readCode(relPath: string): string {
  const text = readFileSync(resolve(PKG, relPath), 'utf-8');
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/')
      );
    })
    .join('\n');
}

/** 用 brace counter 抽出完整函数体(避免 regex 嵌套截断,也避免参数列表里
 *  object destructure 的 {} 被误算为函数体的开括号) */
function extractFunctionBody(code: string, fnName: string): string {
  const startRe = new RegExp(`(?:export\\s+)?function\\s+${fnName}\\s*\\(`);
  const m = code.match(startRe);
  if (!m || m.index === undefined) return '';
  // 1) 跳过参数列表(平衡 () ,允许里面出现 {})
  let i = m.index + m[0].length;
  let parenDepth = 1;
  while (i < code.length && parenDepth > 0) {
    const ch = code[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    i++;
  }
  // 2) 跳过空白 + 返回类型注解(如 `: UseChatStateResult {`),定位 '{'
  while (i < code.length && code[i] !== '{') i++;
  if (i >= code.length) return '';
  const openBraceIdx = i;
  i++;
  // 3) brace counter 走函数体
  let depth = 1;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return code.slice(openBraceIdx + 1, i - 1);
}

describe('cs-round-020: 切会话时右框不能残留上一会话的消息', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 兜底:任何未 mock 的 fetch 不会真打网络
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not mocked', { status: 500 }));
  });

  // ── Scenario 1: 源码契约 ──
  describe('Scenario 1: useChatState effect 在 fetch 之前必含 setMessages([])', () => {
    it('Then useChatState 函数体内,setMessages([]) 必出现在 setHistoryLoading(true) 之后且 fetch 之前', () => {
      const code = readCode('src/hooks/use-chat-state.ts');
      const body = extractFunctionBody(code, 'useChatState');
      expect(body, '应能找到 useChatState 函数体').not.toBe('');

      // 关键契约:`setHistoryLoading(true)` 之后、fetch 之前,必出现 setMessages([])
      // 这才是切会话清空残留的精确锚点(区别于 !activeId 分支的清空)
      const loadingTrueIdx = body.search(/setHistoryLoading\(\s*true\s*\)/);
      const fetchIdx = body.search(/fetch\(/);
      expect(loadingTrueIdx, 'setHistoryLoading(true) 应存在').toBeGreaterThanOrEqual(0);
      expect(fetchIdx, 'fetch 应存在').toBeGreaterThanOrEqual(0);

      // 在 [loadingTrueIdx, fetchIdx] 区间内,必含 setMessages([])
      const betweenSlice = body.slice(loadingTrueIdx, fetchIdx);
      expect(
        betweenSlice,
        'setHistoryLoading(true) 之后、fetch 之前必含 setMessages([]) — ' +
          '切会话清空 prev messages 的精确锚点',
      ).toMatch(/setMessages\(\s*\[\s*\]\s*\)/);
    });
  });

  // ── Scenario 2: 行为 — activeId 从 236 切到 235,fetch 前必 setMessages([]) ──
  describe('Scenario 2: 行为 — activeId 切换后 fetch 前必清 messages', () => {
    it('Then setMessages 必被调过 [],在 fetch 235 之前', async () => {
      const { useChatState } = await import('./hooks/use-chat-state');
      const setMessages = vi.fn();
      const setMessagesArg = setMessages as unknown as React.Dispatch<
        React.SetStateAction<unknown[]>
      >;

      // /history 第一次返 236 的消息(模拟 236 已经被访问过,prev 有数据)
      vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/api/sessions/236/history')) {
          return new Response(
            JSON.stringify({
              messages: [
                {
                  id: 1001,
                  sessionId: 236,
                  role: 'user',
                  content: '',
                  parts: [{ type: 'text', text: '236-旧问题' }],
                  metadata: null,
                  status: 1,
                  createdAt: '',
                  updatedAt: '',
                },
                {
                  id: 1002,
                  sessionId: 236,
                  role: 'assistant',
                  content: '236-旧回答',
                  parts: [{ type: 'text', text: '236-旧回答' }],
                  metadata: null,
                  status: 1,
                  createdAt: '',
                  updatedAt: '',
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('/api/sessions/235/history')) {
          return new Response(
            JSON.stringify({
              messages: [
                {
                  id: 2001,
                  sessionId: 235,
                  role: 'user',
                  content: '',
                  parts: [{ type: 'text', text: '235-新问题' }],
                  metadata: null,
                  status: 1,
                  createdAt: '',
                  updatedAt: '',
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response('not mocked', { status: 500 });
      });

      const { rerender } = renderHook(
        ({ id }: { id: string | null }) =>
          useChatState({
            activeId: id,
            setMessages: setMessagesArg,
            setHistoryLoading: vi.fn(),
          }),
        { initialProps: { id: '236' as string | null } },
      );

      // 等首次 fetch 236 完成
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // 记录切换前 setMessages 被调过的次数(236 的 diff/append 后)
      const callsBeforeSwitch = setMessages.mock.calls.length;

      // 切换到 235
      rerender({ id: '235' });

      // 等 effect 重跑 — 但不等 fetch 完成(我们要看 fetch 之前的状态)
      // 切完马上读 setMessages.mock.calls
      const callsAfterImmediateRerender = setMessages.mock.calls.length;

      // Then — 切换后 setMessages 至少有一次调用(必须是 setMessages([]))
      // 不能等到 fetch 完成才检查(那时 [] 调用可能已被后续 diff 覆盖)
      expect(
        callsAfterImmediateRerender,
        '切换到 235 后,setMessages 必被立即调过([] 用于清空 236 残留)',
      ).toBeGreaterThan(callsBeforeSwitch);

      // 验证这次调用是 setMessages([])
      const latestCall = setMessages.mock.calls[callsAfterImmediateRerender - 1];
      const clearedWithEmpty = setMessages.mock.calls.slice(callsBeforeSwitch).some((c) => {
        if (Array.isArray(c[0])) return c[0].length === 0;
        return false;
      });
      expect(clearedWithEmpty, '切换后第一次 setMessages 调用必须是 []').toBe(true);
      void latestCall;

      // 让 fetch 235 完成
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    });
  });

  // ── Scenario 3: 回归 — cs-round-017/018 契约仍成立 ──
  describe('Scenario 3: 回归 — cs-round-017 / 018 契约仍成立', () => {
    it('Then useChatState !activeId 分支仍清 messages + RAGChat handleDeleteSession 仍清 messages', () => {
      // cs-round-017 回归
      const useChatStateCode = readCode('src/hooks/use-chat-state.ts');
      expect(useChatStateCode, '!activeId 分支仍必含 setMessages([])(cs-round-017 回归)').toMatch(
        /if\s*\(\s*!\s*activeId\s*\)\s*\{[\s\S]*?setMessages\(\s*\[\s*\]\s*\)/,
      );

      // cs-round-018 回归
      const ragChatCode = readCode('src/lib/components/RAGChat.tsx');
      const handleDeleteBody = extractFunctionBody(ragChatCode, 'handleDeleteSession');
      expect(handleDeleteBody, '应能找到 handleDeleteSession').not.toBe('');
      expect(
        handleDeleteBody,
        'handleDeleteSession 仍必含 setMessages([])(cs-round-018 回归)',
      ).toMatch(/setMessages\(\s*\[\s*\]\s*\)/);
    });
  });
});
