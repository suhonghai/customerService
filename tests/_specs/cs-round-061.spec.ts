/**
 * @status implemented
 * @change-id cs-round-061
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause prod 2026-08-18 用户截图(URL=/chat/97,首条消息发问"快递一般几天能到?"):
 *   Network 面板出现**两个** /api/chat 请求(都 200 但都 XHR-cancel,5-6s 取消),
 *   UI 同时显示**两条**完全相同的 AI 回答。
 *
 *   根因:`MessageInput.tsx:28-33` 的 handleKeyDown 在 Enter 时**显式**调
 *   `onSubmit()`(第 1 次),**加上** form 里有 `<button type="submit">`,
 *   浏览器 HTML spec 的 implicit submission 规则(form 有 default submit
 *   button 时,Enter 模拟 click 该 button)→ form 触发 submit event →
 *   React 合成 onSubmit 走 `handleSubmit` → `onSubmit()` 第 2 次。
 *
 *   `e.preventDefault()` 在 onKeyDown 里只阻止 native default action(插入
 *   换行),**不**阻止 implicit form submit 的 submit event。两次 onSubmit
 *   都在 status='ready' 期间跑过 `!isLoading` gate(useChat 内部 status 还没
 *   变),都创建 1 个 user msg + 1 个 assistant msg,都走 sendMessages → 2 个
 *   并发 POST /api/chat。两个 stream 都正常走完,所以 UI 出现 2 条 AI 回答。
 *
 * cs-round-061 修法:
 *   A. MessageInput.tsx 的 handleKeyDown **删掉** `onSubmit()` 调用,只保留
 *      `e.preventDefault()`。Enter 路径变成:preventDefault 阻止 native 换行 →
 *      浏览器继续走 implicit form submit → form onSubmit 1 次 → onSubmit 1 次。
 *      单一来源,意图清晰:Enter 触发 form 的 native submit 行为。
 *   B. (无须新增代码)RAGChat 的 onSubmit 已经做了 isLoading gate,但同一 tick
 *      内 2 次事件 status 都没变,gate 拦不住,这是事件触发层的 bug,不在调用层
 *      兜底。修 A 是根治。
 *
 *   Out of scope:
 *   - 其他 form (login page 等) — 它们是 single input,行为本来就对(Enter → 1 次 submit)
 *   - 改 useChat 的 sendMessage 加 reentrancy 锁 — 修 A 后单源,不需要
 *   - 加 useRef lastSentText 防双击 — 修 A 后单源,不需要
 *   - 后端 chat route 并发处理(已由 cs-round-060 修,本 spec 不重复)
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

describe('cs-round-061: MessageInput Enter 触发单源 form submit(防 2 次 sendMessage)', () => {
  it('Then: handleKeyDown 必须只 preventDefault,不能直接调 onSubmit()', () => {
    const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/MessageInput.tsx');
    expect(existsSync(p)).toBe(true);
    const text = stripComments(readFileSync(p, 'utf-8'));

    // 契约 1:定位 handleKeyDown 函数体 — Enter 分支必须只 preventDefault,
    // 不能直接调 onSubmit()。如果调了,form 的 implicit submit 还会再触发 1 次。
    // 用 function scope 切片,找到 handleKeyDown 的 Enter 分支块:
    //   function handleKeyDown(...) {
    //     if (e.key === 'Enter' && !e.shiftKey) {
    //       e.preventDefault()
    //       <这里必须没有 onSubmit()>
    //     }
    //   }
    // 策略:匹配 handleKeyDown 整个函数体,断言函数体内 **没有** `onSubmit()` 调用。
    const handleKeyDownMatch = text.match(
      /function\s+handleKeyDown\s*\([^)]*\)\s*\{[\s\S]*?\n\s{2}\}/,
    );
    expect(
      handleKeyDownMatch?.[0] ?? '',
      'handleKeyDown 函数必须存在',
    ).toBeTruthy();
    expect(
      handleKeyDownMatch![0],
      'handleKeyDown 函数体内不能直接调 onSubmit()(会与 form implicit submit 重复触发)',
    ).not.toMatch(/onSubmit\s*\(\s*\)/);

    // 契约 2:Enter 分支必须保留 e.preventDefault()(阻止 native 换行,
    // 让浏览器走 implicit form submit 路径)。
    expect(
      handleKeyDownMatch![0],
      'handleKeyDown 的 Enter 分支必须 preventDefault',
    ).toMatch(/e\.preventDefault\s*\(/);

    // 契约 3:form 上必须有 onSubmit 绑 handleSubmit(单一来源)。
    // 浏览器 implicit submit 触发 native submit event → React 调度 form onSubmit → handleSubmit → onSubmit() 1 次。
    expect(
      text,
      'form 必须有 onSubmit 绑定(Enter 路径走 form onSubmit 单源)',
    ).toMatch(/<form[\s\S]*?onSubmit\s*=\s*\{handleSubmit\}/);

    // 契约 4:发送按钮必须是 type="submit",否则 form 失去 default button,
    // implicit submission 不会触发(Enter 路径断裂,变得不发)。
    expect(
      text,
      '发送按钮必须是 type="submit"(否则 form 失去 default button,Enter 不发)',
    ).toMatch(/<button[\s\S]*?type\s*=\s*["']submit["'][\s\S]*?>[\s\S]*?发送/);
  });
});
