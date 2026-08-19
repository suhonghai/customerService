/**
 * @status implemented
 * @change-id cs-round-062
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause prod session 103 刷新进入,AI 气泡空白,Network 面板无任何
 *   /api/chat 请求。DB 里该 assistant 消息 status=4(content='')= AI 写一半
 *   异常中断。前端 refetch-history.ts:60-77 把 status=4 转译时只标
 *   `isError: true` + `continueFromMessageId`,**不**标 `isStreaming: true`。
 *   useAutoResumeStreaming 钩子第 58 行 `if (!meta.isStreaming) continue;`
 *   只认 isStreaming → status=4 早返跳过 → 不发续推 POST → 用户再进来
 *   看到空气泡 + 没有任何恢复机制。
 *
 *   后端 chat/route.ts:550-555 明确允许续推 status ∈ {2, 4},但前端
 *   钩子 11 个月前只写了 isStreaming 分支(从 cs-round-011 一路传承),
 *   status=4 路径从未被前端使用过。
 *
 * cs-round-062 修法:
 *   A. useAutoResumeStreaming 钩子触发条件扩展:从「只认 isStreaming」
 *      改为「isStreaming OR isError」— status=4 的错误消息也能触发
 *      POST /api/chat 续推。续推时 streamId 仍是原 messageId,后续
 *      chunks 同样 append 到同一条 UI 消息上,逻辑复用 0 成本。
 *   B. 续推触发后,resumeOne 内部已有 fetch + SSE parse + setMessages
 *      全链路(cs-round-011 引入,cs-round-027 解析加固),无需新代码。
 *
 *   Out of scope:
 *   - 方向 2(服务端写库时强制落 errorMessage)— 用户决定单独 PR 做
 *   - ChatView 在续推期间显示「AI 出错了,正在重试」UI 提示 — 续推
 *     期间 useChat 内部 status 变 'streaming' → ChatView 显示「AI 正在
 *     思考」指示器(复用),不需要新写 UI
 *   - useAutoResumeStreaming 的 retry 逻辑(已实现)— 不重复
 *   - status=3 (aborted) — metadata 没有 isError,本改动不影响
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

describe('cs-round-062: useAutoResumeStreaming 也认 isError(status=4 也续推)', () => {
  it('Then: 钩子触发条件必须同时接受 isStreaming 和 isError', () => {
    const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts');
    expect(existsSync(p)).toBe(true);
    const text = stripComments(readFileSync(p, 'utf-8'));

    // 契约 1:useEffect 内的 for 循环体必须包含 isError 续推逻辑
    // 现状:只有 `if (!meta.isStreaming) continue;` → status=4 跳过
    // 期望:改成 `if (!meta.isStreaming && !meta.isError) continue;` 或等价
    // 关键:不能再是「只认 isStreaming」的形式(那是 bug)
    const useEffectBody = text.match(
      /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]+\]\s*\)/,
    );
    expect(
      useEffectBody?.[0] ?? '',
      'useAutoResumeStreaming 必须有 useEffect',
    ).toBeTruthy();

    // 反向契约:不能再只认 isStreaming
    expect(
      useEffectBody![0],
      '续推触发条件不能是只认 isStreaming(会让 status=4 跳过续推)',
    ).not.toMatch(/if\s*\(\s*!\s*meta\.isStreaming\s*\)\s*continue\s*;/);

    // 正向契约:必须包含 isError 续推识别
    expect(
      useEffectBody![0],
      '续推触发条件必须识别 isError(status=4 也要续推)',
    ).toMatch(/isError/);
  });

  it('Then: 续推请求必须传 continueFromMessageId(无论 isStreaming 还是 isError)', () => {
    const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts');
    expect(existsSync(p)).toBe(true);
    const text = stripComments(readFileSync(p, 'utf-8'));

    // 契约 2:resumeOne 必须从 meta.continueFromMessageId 读出值,不能改成
    // 读其他字段(避免大改)。无论 isStreaming/isError 哪个触发,continueFromMessageId
    // 是后端定位原 message 的唯一锚点。
    expect(
      text,
      'resumeOne 必须传 continueFromMessageId 字段(后端唯一锚点)',
    ).toMatch(/continueFromMessageId\s*:\s*meta\.continueFromMessageId/);

    // 契约 3:POST body 必须包含 continueFromMessageId
    expect(
      text,
      'POST /api/chat body 必须带 continueFromMessageId',
    ).toMatch(/continueFromMessageId\s*,/);
  });

  it('Then: 后端 chat route 必须仍允许 status=4 续推(防回归)', () => {
    // 这是后端契约,本 spec 只是回归检查 — 防有人哪天把 status=4 排除掉
    // 后端 chat/route.ts 明确说"仅允许续推 2(streaming)/4(error)"
    const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
    expect(existsSync(p)).toBe(true);
    const text = stripComments(readFileSync(p, 'utf-8'));

    expect(
      text,
      'chat/route.ts 续推分支必须仍允许 status=4(防回归)',
    ).toMatch(/existing\.status\s*!==\s*2\s*&&\s*existing\.status\s*!==\s*4/);
  });
});
