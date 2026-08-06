/**
 * @status draft
 * @change-id cs-round-017
 *
 * cs-round-017: 点 "+ 新会话" 后右框必须回到 6-quick-question welcome 页
 *
 * Why(为什么做):
 * 用户报「现在点击新会话右边的聊天框还是展示的上一个会话的信息,没有展示那 6 个
 * 选择项页面」。Playwright 抓真实 UI 后定位:
 *
 * Bug 链路:
 *   - handleCreateSession (RAGChat.tsx:301) 只做 stop() + enterDraft() +
 *     router.replace('/'),**没有清 messages state**。
 *   - messages 是 useChat (ai-sdk) 的内部 state,生命周期 = RAGChat 实例,
 *     常驻不释放,除非显式 setMessages([])。
 *   - useChatState effect 在 activeId 变 null 时早返:
 *       if (!activeId) return;
 *     既不清 messages,也不重置 backendSessionId。
 *   - ChatView.tsx 渲染分支按 messages.length 切:
 *       length === 0 && kbReady && sessionsReady → WelcomeMessage (6 张卡片)
 *       length > 0 → 渲染旧消息
 *     因 messages 还是上一会话的,WelcomeMessage 永远不显示。
 *
 * 修法:
 *   把"清空责任"放在 useChatState effect 的 !activeId 早返分支里(契约级)。
 *   所有"activeId → null"路径自动覆盖:
 *     - handleCreateSession:enterDraft() 触发 activeId=null
 *     - handleDeleteSession(删最后一条):deleteSession 内部 setActiveId(null)
 *   新分支:
 *     setMessages([]);
 *     setBackendSessionId(null);
 *     setHistoryLoading(false);
 *     return;
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — useChatState effect 在 !activeId 早返分支必须
 *               清空三件事(messages / backendSessionId / historyLoading)
 *     Given ai-cs-demo/src/hooks/use-chat-state.ts 源码
 *     Then  `if (!activeId) {` 块体内必出现 setMessages([])
 *     And   `if (!activeId) {` 块体内必出现 setBackendSessionId(null)
 *     And   `if (!activeId) {` 块体内必出现 setHistoryLoading(false)
 *
 *   Scenario 2: 行为 — activeId 从 '221' 变 null,setMessages 必被调 with [],
 *               backendSessionId 必变 null
 *     Given useChatState({ activeId: '221', setMessages: spy, setHistoryLoading: spy })
 *     And   GET /api/sessions/221/history 返回 { messages: [<msg1>, <msg2>] }
 *     When  rerender({ activeId: null })
 *     Then  setMessages 被调过含 [] (welcome 重置)
 *     And   result.current.backendSessionId === null
 *     And   /api/sessions/<id>/history 不应被再 fetch (draft 不拉历史)
 *
 *   Scenario 3: 回归 — 初次 mount(activeId=null)不应 fetch /history
 *     Given useChatState({ activeId: null, ... })
 *     When  mount + 等 effect
 *     Then  fetch 不被调
 *     And   setMessages 不应被任何 call 触发(prev messages 已 [] → 不必再 [] 写)
 *     (注:实现里 mount 时也会调 setMessages([]) 一遍,幂等无副作用,本场景守住
 *      "不 fetch" 即可)
 *
 *   Scenario 4: ChatView 渲染契约 — messages.length===0 + kbReady + sessionsReady
 *               时必须渲染 <WelcomeMessage>
 *     Given ai-cs-demo/src/components/chat/ChatView.tsx 源码
 *     Then  条件 `messages.length === 0 && kbReady && sessionsReady` 必出现
 *     And   WelcomeMessage 组件必被该条件渲染
 *
 * Out of scope:
 * - useChat (ai-sdk) 自身的 messages state 初始化策略(默认空数组,本 spec 不动)
 * - useRealtime WS 关闭顺序(useChatState 顺手重置 backendSessionId 已足够)
 * - deleteSession 内部实现(只关心 activeId=null 这条出口被 useChatState 接住)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-017.spec.ts,
 *      验证 useChatState 行为 + 源码契约 + ChatView 渲染契约。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** 读源文件并剥掉注释 — 跟 cs-round-013/015 同模式 */
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

describe('cs-round-017: 点 + 新会话右框必须清空回 welcome 页', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 兜底:任何未 mock 的 fetch 不会真打网络
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not mocked', { status: 500 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Scenario 1: 源码契约 — !activeId 分支必清三件事 ──
  describe('Scenario 1: useChatState effect !activeId 分支源码契约', () => {
    it('Then 分支体内必出现 setMessages([]) / setBackendSessionId(null) / setHistoryLoading(false)', () => {
      const code = readCode('src/hooks/use-chat-state.ts');

      // 取出 useEffect 体内的早返分支(从 `if (!activeId)` 到块尾或下一个 effect 之前)
      const earlyReturnBlock = code.match(/if\s*\(\s*!\s*activeId\s*\)\s*\{[\s\S]*?\n\s*\}/);
      expect(
        earlyReturnBlock?.[0] ?? '',
        '应能找到 useChatState effect 内的 `if (!activeId) { ... }` 早返分支',
      ).toBeTruthy();
      const block = earlyReturnBlock?.[0] ?? '';

      expect(block, '!activeId 分支必须 setMessages([]) — 清右框回到 welcome').toMatch(
        /setMessages\(\s*\[\s*\]\s*\)/,
      );
      expect(
        block,
        '!activeId 分支必须 setBackendSessionId(null) — 重置后端 id,防止 stale WS',
      ).toMatch(/setBackendSessionId\(\s*null\s*\)/);
      expect(
        block,
        '!activeId 分支必须 setHistoryLoading(false) — 重置 loading,避免残留 spinner',
      ).toMatch(/setHistoryLoading\(\s*false\s*\)/);
    });
  });

  // ── Scenario 2: 行为 — activeId 从 '221' 变 null → 清 messages + backendSessionId ──
  describe('Scenario 2: 行为验证 activeId 从有效 id 变 null', () => {
    it('Then setMessages 必被调含 [],backendSessionId 变 null,无新 fetch', async () => {
      const { useChatState } = await import('./hooks/use-chat-state');
      const setMessages = vi.fn();
      const setMessagesArg = setMessages as unknown as React.Dispatch<
        React.SetStateAction<unknown[]>
      >;

      // /history 返回 2 条 mock — 模拟"上一会话有内容"
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            messages: [
              {
                id: 1,
                sessionId: 221,
                role: 'user',
                content: '',
                parts: [{ type: 'text', text: '旧问题' }],
                metadata: null,
                status: 1,
                createdAt: '',
                updatedAt: '',
              },
              {
                id: 2,
                sessionId: 221,
                role: 'assistant',
                content: '旧回答',
                parts: [{ type: 'text', text: '旧回答' }],
                metadata: null,
                status: 1,
                createdAt: '',
                updatedAt: '',
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const { result, rerender } = renderHook(
        ({ id }: { id: string | null }) =>
          useChatState({
            activeId: id,
            setMessages: setMessagesArg,
            setHistoryLoading: vi.fn(),
          }),
        { initialProps: { id: '221' as string | null } },
      );

      // 等首次 fetch 完成,backendSessionId 应 === 221
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(result.current.backendSessionId).toBe(221);
      const fetchCallsBefore = fetchSpy.mock.calls.length;

      // 模拟"点 + 新会话" → enterDraft() 把 activeId 切到 null
      rerender({ id: null });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Then — backendSessionId 已重置
      expect(result.current.backendSessionId, 'draft 态 backendSessionId 必为 null').toBeNull();

      // Then — setMessages 必被调过含 [](或 updater 形式返 [])
      const clearedWithEmptyArray = setMessages.mock.calls.some((c) => {
        if (Array.isArray(c[0])) return c[0].length === 0;
        if (typeof c[0] === 'function') {
          const result = (c[0] as (prev: unknown[]) => unknown[])([{ id: 'x' }, { id: 'y' }]);
          return Array.isArray(result) && result.length === 0;
        }
        return false;
      });
      expect(
        clearedWithEmptyArray,
        'setMessages 至少一次以 [] 形式(或 updater 返 [])被调,welcome 重置',
      ).toBe(true);

      // Then — 不应再 fetch 新 /history(draft 不拉历史)
      const fetchCallsAfter = fetchSpy.mock.calls.length;
      expect(fetchCallsAfter, 'activeId 变 null 后不应再 fetch /history(draft 早返)').toBe(
        fetchCallsBefore,
      );
    });
  });

  // ── Scenario 3: 回归 — 初次 mount(activeId=null)不 fetch ──
  describe('Scenario 3: 回归 — 初次 mount activeId=null 不应 fetch', () => {
    it('Then fetch 不被调,setMessages 不必触发副作用', async () => {
      const { useChatState } = await import('./hooks/use-chat-state');
      const setMessages = vi.fn();
      const setMessagesArg = setMessages as unknown as React.Dispatch<
        React.SetStateAction<unknown[]>
      >;
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('not used', { status: 500 }));

      renderHook(() =>
        useChatState({
          activeId: null,
          setMessages: setMessagesArg,
          setHistoryLoading: vi.fn(),
        }),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Then — 不 fetch /history
      expect(fetchSpy, 'activeId=null mount 不应 fetch /history').not.toHaveBeenCalled();
    });
  });

  // ── Scenario 4: ChatView 渲染契约 ──
  describe('Scenario 4: ChatView 渲染契约 — messages.length===0 必渲染 WelcomeMessage', () => {
    it('Then ChatView.tsx 源码里条件 `messages.length === 0 && kbReady && sessionsReady` 必渲染 WelcomeMessage', () => {
      const code = readCode('src/components/chat/ChatView.tsx');
      // 渲染分支必须包含三条件 + WelcomeMessage
      expect(code, 'ChatView 必按 messages.length===0 切 welcome').toMatch(
        /messages\.length\s*===\s*0\s*&&\s*kbReady\s*&&\s*sessionsReady/,
      );
      expect(code, 'welcome 条件分支必渲染 <WelcomeMessage />').toMatch(/<WelcomeMessage\b/);
    });
  });
});
