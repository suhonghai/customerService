/**
 * @status implemented
 * @change-id cs-round-065
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause prod `chat.suhhai.cn/chat/119` 截图(2026-08-19 14:18):
 *   1. 转人工后,客服回复触发 `/api/chat` 被调 3 次(8.28s / 1.27s / 333ms),
 *      `/history` 被调 4 次(172/51/289/56ms)。
 *   2. 输入文字按 Enter 不能发送,只能鼠标点"发送"按钮。
 *
 *   Bug A 根因(`RAGChat.tsx:191-205`):
 *     WS 收到 operator_reply → `refetchHistoryRef.current(backendSessionId)` →
 *     `setMessages(restored)` 整组覆盖本地 messages。
 *     `restored` 包含旧 assistant placeholder(status=2 →
 *     `metadata.isStreaming=true` by `refetch-history.ts:44-58`),
 *     覆盖丢失本地 useChat 的 streaming state →
 *     `useAutoResumeStreaming` effect 看到 isStreaming=true →
 *     POST `/api/chat` 续推 ❌。
 *     新流式产生新 placeholder → WS push / refetch / setMessages 覆盖 → 死循环。
 *     `onRecover` 路径(line 267-275)已经用 `dedupeMessagesByContent([...prev, ...recovered])`
 *     做 diff/append 行为正确;`onMessage → refetchHistoryRef` 路径是覆盖,是唯一不一致点。
 *
 *   Bug B 根因(`MessageInput.tsx:33-38`):
 *     cs-round-061 假设 `e.preventDefault()` 阻止 native 换行后,浏览器继续走 HTML
 *     spec implicit submission(form 有 default submit button → Enter 模拟 click
 *     → submit event)。实际 `e.preventDefault()` 同时阻止 implicit submission —
 *     prod 真实浏览器 Enter 完全无响应。
 *     测试用 `fireEvent.submit(form)`(test line 94-95)手动模拟 implicit submission,
 *     **没暴露**这个 bug。User 只能 mouse click "发送" button。
 *
 * cs-round-065 修法(总 ~2 行业务代码):
 *   A. RAGChat.tsx:200 `setMessages(restored)` 改为
 *      `setMessages((prev) => dedupeMessagesByContent([...prev, ...restored]))` —
 *      与 onRecover 路径对称,保留本地 streaming state。
 *   B. MessageInput.tsx:33-38 preventDefault 后加 `e.currentTarget.form?.requestSubmit()` —
 *      显式触发 form submit event,不依赖 implicit submission(跨浏览器一致)。
 *      `requestSubmit()` 即使 button disabled 也能触发 submit event(programmatic
 *      submit 不走 button click 路径)。
 *
 *   Out of scope:
 *   - 改 useAutoResumeStreaming 触发条件 — 治本应该是 messages 数组不出现重复 msg,
 *     cs-round-065 直接修根因(history refetch 不该覆盖本地 state)
 *   - 改后端 chat/route.ts in-human-handoff 路径 — 与 WS 推送路径无关
 *   - 改 useChatState skip 分支(cs-round-064) — 不同触发链
 *   - 改 MessageInput.test.tsx 的 fireEvent.submit hack — 现测试仍能过(显式 submit
 *     走 form onSubmit)。需要更贴近真实浏览器的测试留给后续 spec
 *   - 改 useRealtime.onRecover — 已经是 diff/append,无需改
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') &&
        !t.startsWith('/*') &&
        !t.startsWith('*') &&
        !t.startsWith('*/')
      );
    })
    .join('\n');
}

describe('cs-round-065: 转人工后客服回复误调 /api/chat + Enter 键失效', () => {
  describe('A. RAGChat refetchHistoryRef 必须 diff/append 而非覆盖', () => {
    it('Then: refetchHistoryRef 必须用 updater 函数形式调 setMessages', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/components/RAGChat.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.1:refetchHistoryRef 内不能有 `setMessages(restored)` 整组覆盖
      // — 会被 useAutoResumeStreaming 误判触发 /api/chat 续推
      // 提取 refetchHistoryRef 的 effect  内
      const refetchEffect = text.match(
        /refetchHistoryRef\.current\s*=\s*async[\s\S]*?\}\s*;\s*\}/,
      );
      expect(
        refetchEffect?.[0] ?? '',
        'refetchHistoryRef effect 必须存在',
      ).toBeTruthy();
      expect(
        refetchEffect![0],
        'refetchHistoryRef 不能整组覆盖 setMessages(restored)(会丢失本地 streaming state)',
      ).not.toMatch(/setMessages\s*\(\s*restored\s*\)/);

      // 契约 A.2:必须用 updater 函数形式 + dedupeMessagesByContent 合并
      expect(
        refetchEffect![0],
        'refetchHistoryRef 必须用 setMessages((prev) => ...) updater 函数形式',
      ).toMatch(/setMessages\s*\(\s*\(\s*prev\s*\)\s*=>/);
      expect(
        refetchEffect![0],
        'refetchHistoryRef 必须调 dedupeMessagesByContent 合并(避免重复 msg 触发续推)',
      ).toMatch(/dedupeMessagesByContent\s*\(\s*\[\s*\.\.\.\s*prev\s*,\s*\.\.\.\s*restored\s*\]\s*\)/);
    });

    it('Then: onRecover 路径仍走 dedupeMessagesByContent diff/append(回归)', () => {
      // 防 cs-round-065 改动把 onRecover 弄坏了
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/components/RAGChat.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'onRecover 路径仍必须用 dedupeMessagesByContent([...prev, ...recovered]) 合并',
      ).toMatch(
        /onRecover[\s\S]*?dedupeMessagesByContent\s*\(\s*\[\s*\.\.\.\s*prev\s*,\s*\.\.\.\s*recovered\s*\]\s*\)/,
      );
    });

    it('Then: RAGChat 必须 import dedupeMessagesByContent', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/components/RAGChat.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'RAGChat 必须 import dedupeMessagesByContent 复用 dedupe-messages 工具',
      ).toMatch(
        /import\s*\{[\s\S]*?dedupeMessagesByContent[\s\S]*?\}\s*from\s*['"]@\/lib\/dedupe-messages['"]/,
      );
    });
  });

  describe('B. MessageInput Enter 走 form.requestSubmit 显式触发', () => {
    it('Then: handleKeyDown Enter 分支保留 preventDefault + 加 requestSubmit', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/MessageInput.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.1:handleKeyDown 函数体的 Enter 分支必须 preventDefault
      const handleKeyDownMatch = text.match(
        /function\s+handleKeyDown\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(
        handleKeyDownMatch?.[0] ?? '',
        'handleKeyDown 函数必须存在',
      ).toBeTruthy();
      expect(
        handleKeyDownMatch![0],
        'handleKeyDown Enter 分支必须 preventDefault(阻止 native 换行)',
      ).toMatch(/e\.preventDefault\s*\(/);

      // 契约 B.2:handleKeyDown 必须显式调 form.requestSubmit()(不依赖 implicit submission)
      expect(
        handleKeyDownMatch![0],
        'handleKeyDown 必须调 form.requestSubmit() 触发 submit event(防 implicit submission 失效)',
      ).toMatch(/\.requestSubmit\s*\(\s*\)/);
    });

    it('Then: handleKeyDown 不能直接调 onSubmit()(防 2 次 sendMessage — cs-round-061 回归)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/MessageInput.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const handleKeyDownMatch = text.match(
        /function\s+handleKeyDown\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(
        handleKeyDownMatch?.[0] ?? '',
        'handleKeyDown 函数必须存在',
      ).toBeTruthy();
      expect(
        handleKeyDownMatch![0],
        'handleKeyDown 函数体内不能直接调 onSubmit()(会与 form onSubmit 重复触发)',
      ).not.toMatch(/onSubmit\s*\(\s*\)/);
    });
  });

  describe('C. 回归契约', () => {
    it('Then: MessageInput form 仍是 <form onSubmit={handleSubmit}> + button type="submit"', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/MessageInput.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'form 必须有 onSubmit 绑定(单一来源:button click 或 Enter 都走它)',
      ).toMatch(/<form[\s\S]*?onSubmit\s*=\s*\{handleSubmit\}/);
      expect(
        text,
        '发送按钮必须是 type="submit"(manual click 走 form onSubmit)',
      ).toMatch(/<button[\s\S]*?type\s*=\s*["']submit["'][\s\S]*?>[\s\S]*?发送/);
    });

    it('Then: MessageInput Shift+Enter 仍走 native 换行分支(不调 requestSubmit)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/MessageInput.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约:handleKeyDown 的 if 条件必须是 `e.key === 'Enter' && !e.shiftKey`
      // — Shift+Enter 不进 if,不 preventDefault,不 requestSubmit → native 换行
      const handleKeyDownMatch = text.match(
        /function\s+handleKeyDown\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(
        handleKeyDownMatch?.[0] ?? '',
        'handleKeyDown 函数必须存在',
      ).toBeTruthy();
      expect(
        handleKeyDownMatch![0],
        'handleKeyDown 必须用 !e.shiftKey 守卫(Shift+Enter 走 native 换行)',
      ).toMatch(/e\.key\s*===\s*['"]Enter['"]\s*&&\s*!e\.shiftKey/);
    });

    it('Then: cs-round-064 useChatState skip 分支不被破坏', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // cs-round-064 的核心契约:activeId effect 必须含 chatStatusRef-based skip 分支
      expect(
        text,
        'cs-round-064 chatStatusRef 同步契约不能破坏',
      ).toMatch(/chatStatusRef\.current\s*=\s*chatStatus/);
      expect(
        text,
        'cs-round-064 skip 分支条件必须保留(status + prev-draft/tempId + backendId)',
      ).toMatch(
        /chatStatusRef\.current\s*===\s*['"]submitted['"][\s\S]{0,300}?return\s*;/,
      );
    });

    it('Then: storedToUIMessages 仍把 status=2 翻译成 isStreaming(刷新场景回归)', () => {
      // cs-round-065 修的是 RAGChat refetch 路径覆盖,不是 storedToUIMessages 翻译逻辑
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/refetch-history.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'storedToUIMessages 必须仍把 status=2 翻译成 isStreaming + continueFromMessageId',
      ).toMatch(
        /status\s*===\s*2[\s\S]{0,400}isStreaming\s*:\s*true[\s\S]{0,200}?continueFromMessageId/,
      );
    });

    it('Then: useAutoResumeStreaming 续推触发条件(isStreaming OR isError)不被破坏', () => {
      // cs-round-062 的改动不被破坏
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const useEffectBody = text.match(
        /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]+\]\s*\)/,
      );
      expect(
        useEffectBody?.[0] ?? '',
        'useAutoResumeStreaming 必须有 useEffect',
      ).toBeTruthy();
      expect(
        useEffectBody![0],
        '续推触发条件必须仍是 isStreaming OR isError(cs-round-062 回归)',
      ).toMatch(/isStreaming[\s\S]*?isError|isError[\s\S]*?isStreaming/);
    });
  });
});