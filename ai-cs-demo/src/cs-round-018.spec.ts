/**
 * @status draft
 * @change-id cs-round-018
 *
 * cs-round-018: 删 active 会话后右框不能残留已删会话的消息
 *
 * Why(为什么做):
 * 用户报「删除一个会话,聊天框为什么会展示删除这个会话的消息」,截图显示:
 *   - 左侧 sidebar 只剩「快递一般几天能到?」(下一个最近会话)
 *   - 右侧 chat box 同时显示:
 *       * 「我想退货怎么办」+ AI 回答 ← 已删会话,残留!
 *       * 「快递一般几天能到?」+ AI 回答 ← 下一个最近会话
 *
 * Bug 链路:
 *   - handleDeleteSession (RAGChat.tsx:306) 只做 stop() + deleteSession(id),
 *     **没有清 messages state**。
 *   - deleteSession (use-sessions.ts) 内部:
 *       setActiveId((cur) => {
 *         if (cur !== id) return cur;
 *         ...remaining.length === 0 → null
 *         ...else → 下一个最近会话的 id
 *       })
 *     删 active 后 activeId 自动切到下一个最近会话(非 null)。
 *   - useChatState effect 跑:activeId 从 A 变到 B → fetch /history for B →
 *     setMessages((prev) => [...prev, ...newFromBackend])(diff/append 逻辑)
 *   - prev 是已删 A 的 messages,newFromBackend 是 B 的 messages → 两条都在。
 *   - 视觉:右框显示 [A.u1, A.a1, B.u1, B.a1],A 那段是死的但还在屏上。
 *
 * cs-round-017 已守"activeId=null"路径(删最后一个 / 点 + 新会话),
 * cs-round-018 守"activeId 切到下一个"路径(删中间一个,还有剩余会话)。
 *
 * 修法:
 *   在 handleDeleteSession 删的是 active 时,**先 setMessages([])**。
 *   后续 useChatState effect fetch 下一个会话的 history → diff/append
 *   (此时 prev=[],把 B 全部 append 上去)→ 右框只显示 B。
 *
 *   不删 active 的情况(删非激活会话):不动 setMessages — activeId 不变,
 *   useChatState effect 不跑,messages 跟当前 active 会话对应,无需清。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — handleDeleteSession 内,删 active 分支必先
 *               setMessages([])
 *     Given ai-cs-demo/src/lib/components/RAGChat.tsx 源码
 *     Then  handleDeleteSession 函数体内必出现 setMessages([])
 *     And   setMessages([]) 调用必出现**早于** deleteSession(id) 调用
 *           (否则清空晚于 setActiveId → diff/append 还会被旧 messages 污染)
 *
 *   Scenario 2: 源码契约 — 删非 active 会话时不应清 messages(防过度清理)
 *     Given ai-cs-demo/src/lib/components/RAGChat.tsx 源码
 *     Then  handleDeleteSession 应只在 id === activeId 时清空
 *     (允许几种等价写法:`if (id === activeId) { setMessages([]) }` /
 *      或 `if (id !== activeId) return; setMessages([]);`)
 *
 *   Scenario 3: cs-round-017 已守 — activeId=null 时 useChatState effect
 *               自清 messages(回归)
 *     Given ai-cs-demo/src/hooks/use-chat-state.ts
 *     Then  !activeId 分支内 setMessages([]) 必存在(同 cs-round-017 契约)
 *
 * Out of scope:
 * - deleteSession 内部 setActiveId(next) vs URL 真相源的设计张力
 *   (useSessions 删除中间会话后 URL 仍停在 /,这是另一个设计问题,
 *    本 spec 只解决右框消息残留这一用户可观察问题)
 * - useChat (ai-sdk) 自身 messages state 生命周期
 *
 * 落点:co-located ai-cs-demo/src/cs-round-018.spec.ts,
 *      验证 handleDeleteSession 源码契约。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** 读源文件并剥掉注释 — 跟 cs-round-013/015/017 同模式 */
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

/** 从源码里用 brace counter 抽出完整函数体(避免 regex 在嵌套块上截断) */
function extractFunctionBody(code: string, fnName: string): string {
  const startRe = new RegExp(`function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{`);
  const m = code.match(startRe);
  if (!m || m.index === undefined) return '';
  const openIdx = m.index + m[0].length;
  let depth = 1;
  let i = openIdx;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return code.slice(openIdx, i - 1);
}

describe('cs-round-018: 删 active 会话后右框不能残留已删会话的消息', () => {
  // ── Scenario 1: 源码契约 — handleDeleteSession 删 active 必先 setMessages([]) ──
  describe('Scenario 1: handleDeleteSession 删 active 必先 setMessages([])', () => {
    it('Then 函数体内必出现 setMessages([]),且必早于 deleteSession(id) 调用', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');

      // 用 brace counter 抽取完整函数体(避免 regex 在嵌套块上截断)
      const body = extractFunctionBody(code, 'handleDeleteSession');
      expect(body, '应能找到 RAGChat.tsx 的 handleDeleteSession 函数体').not.toBe('');

      // 必须出现 setMessages([])
      expect(body, 'handleDeleteSession 必含 setMessages([])').toMatch(
        /setMessages\(\s*\[\s*\]\s*\)/,
      );

      // setMessages([]) 必早于 deleteSession(id)
      const setMessagesIdx = body.search(/setMessages\(\s*\[\s*\]\s*\)/);
      const deleteSessionIdx = body.search(/deleteSession\s*\(/);
      expect(setMessagesIdx, 'setMessages([]) 位置应存在').toBeGreaterThanOrEqual(0);
      expect(deleteSessionIdx, 'deleteSession(id) 位置应存在').toBeGreaterThanOrEqual(0);
      expect(
        setMessagesIdx < deleteSessionIdx,
        'setMessages([]) 必**早于** deleteSession(id) — 否则 setActiveId(next) 触发的 ' +
          'useChatState effect diff/append 仍会拿到旧 prev messages',
      ).toBe(true);
    });
  });

  // ── Scenario 2: 删非 active 会话不应清 messages ──
  describe('Scenario 2: 删非 active 会话不应清空 messages', () => {
    it('Then setMessages([]) 调用前必含 `id === activeId` 或等价守卫', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      const body = extractFunctionBody(code, 'handleDeleteSession');
      expect(body, '应能找到 handleDeleteSession 函数体').not.toBe('');

      // setMessages([]) 前面 200 字符内,必须有 activeId 守卫
      // 允许: `if (id === activeId)` / `if (id === activeId) {` / `if (activeId === id)`
      const setMessagesIdx = body.search(/setMessages\(\s*\[\s*\]\s*\)/);
      expect(setMessagesIdx, 'setMessages([]) 位置应存在').toBeGreaterThanOrEqual(0);

      const leadingSlice = body.slice(Math.max(0, setMessagesIdx - 200), setMessagesIdx);
      expect(
        leadingSlice,
        'setMessages([]) 必在 activeId 守卫内(防止清掉非 active 会话下的 messages)',
      ).toMatch(/id\s*===\s*activeId|activeId\s*===\s*id/);
    });
  });

  // ── Scenario 3: 回归 — cs-round-017 契约仍成立 ──
  describe('Scenario 3: 回归 — useChatState effect !activeId 分支仍清 messages', () => {
    it('Then use-chat-state.ts 里 `if (!activeId) {` 块体内必出现 setMessages([])', () => {
      const code = readCode('src/hooks/use-chat-state.ts');
      const earlyReturnBlock = code.match(/if\s*\(\s*!\s*activeId\s*\)\s*\{[\s\S]*?\n\s*\}/);
      expect(
        earlyReturnBlock?.[0] ?? '',
        '应能找到 useChatState effect 内 `if (!activeId) { ... }` 早返分支',
      ).toBeTruthy();
      const block = earlyReturnBlock?.[0] ?? '';
      expect(block, '!activeId 分支仍必须 setMessages([])(cs-round-017 回归)').toMatch(
        /setMessages\(\s*\[\s*\]\s*\)/,
      );
    });
  });
});
