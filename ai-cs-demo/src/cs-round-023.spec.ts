/**
 * @status draft
 * @change-id cs-round-023
 *
 * cs-round-023: MCP client 不绑 req.signal(对齐 W11 invariant,修立即刷新 AI_NoOutputGeneratedError)
 *
 * Why(为什么做):
 * 用户报「问完问题立即刷新页面,流式接口报 AI_NoOutputGeneratedError」。
 * 根因:ai-cs-demo/src/app/api/chat/route.ts:464(改前)把 req.signal 传给
 *   createMcpStdioClient({ abortSignal: req.signal, cfg: activeCfg })
 * → 用户刷新触发 req.signal abort → MCP 子进程被 Experimental_StdioMCPTransport
 *   杀掉 → streamText 在 0 chunk 时就 abort → AI SDK 抛 AI_NoOutputGeneratedError
 *   → SSE 推 error 给 client → onError PATCH status=4 → 误导 useAutoResumeStreaming
 *   拿 status=4 去续推 → 续推又 0 chunk → 死循环(虽然 cs-round-021 dedupe 拦了,
 *   但根本问题没解决)。
 *
 * 与 W11 invariant 不一致:route.ts:658-664 注释明确「streamText 不绑 req.signal」,
 * MCP 子进程作为 streamText 的依赖也应遵循同一不变量(streamText 完成 → finally
 *   块的 mcp.close() 收)。修法:把 MCP client 的 abortSignal: req.signal 移除。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — MCP client 不绑 req.signal
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  createMcpStdioClient 调用点 grep 不应包含 `abortSignal: req.signal`
 *           (反向断言:允许实现细节变化 — createMcpStdioClient({ cfg }) 或
 *           createMcpStdioClient({...}) 都过,只要不出现 abortSignal: req.signal)
 *     And   该调用点紧邻注释必含 "cs-round-023" 字样(grep 验 commit 锚点)
 *
 *   Scenario 2: 回归 — streamText 仍不绑 req.signal(W11 invariant 一致性)
 *     Given chat/route.ts 里 streamText({...}) 调用
 *     Then  该调用体内不应出现 `abortSignal: req.signal` 或 `signal: req.signal`
 *           (反向断言:确保没人顺手补回去)
 *
 * Out of scope:
 * - createMcpStdioClient 实现本身(mcp-client.ts 接口里仍保留 abortSignal?: AbortSignal
 *   可选字段以兼容其他调用方)— 不动
 * - escalate/route.ts 中 createMcpStdioClient 的调用 — 不动(本次只修 chat)
 * - useAutoResumeStreaming / refetch-history / useChatState(都是上游 cs-round 修过的)
 * - 后端 NestJS / cs_message schema — 不动
 * - placeholder stuck status=2 / id=290-style 孤儿 — 不是本 PR scope
 *
 * 落点:co-located ai-cs-demo/src/cs-round-023.spec.ts,
 *      验证 2 处源码契约(MCP client 调用点 + streamText 体内不绑 req.signal)。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

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

function readRaw(relPath: string): string {
  return readFileSync(resolve(PKG, relPath), 'utf-8');
}

describe('cs-round-023: MCP client 不绑 req.signal(对齐 W11 invariant)', () => {
  // ── Scenario 1: 源码契约 — MCP client 不绑 req.signal ──
  describe('Scenario 1: createMcpStdioClient 调用点不绑 req.signal', () => {
    it('Then createMcpStdioClient 调用不应包含 `abortSignal: req.signal` + 注释必含 cs-round-023', () => {
      const code = readCode('src/app/api/chat/route.ts');
      const raw = readRaw('src/app/api/chat/route.ts');

      // 找到 createMcpStdioClient 调用点(用 raw,因为注释里也有这个名字提及)
      const callIdx = raw.search(/createMcpStdioClient\s*\(/);
      expect(callIdx, 'createMcpStdioClient 调用必须存在').toBeGreaterThanOrEqual(0);

      // 抠出整个调用表达式(到对应右括号)— brace-count 找配对闭括号
      let i = raw.indexOf('(', callIdx) + 1;
      let depth = 1;
      const callStart = i;
      while (i < raw.length && depth > 0) {
        const ch = raw[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
      const callExpr = raw.slice(callStart, i - 1);

      // 反向断言:调用表达式内不应出现 `abortSignal: req.signal`
      expect(
        callExpr,
        'createMcpStdioClient 调用点不应包含 `abortSignal: req.signal`(W11 invariant)',
      ).not.toMatch(/abortSignal:\s*req\.signal/);

      // 锚点:紧邻调用点 ±800 字符(注释 + 调用表达式本身)必含 "cs-round-023" 字样
      const ctxStart = Math.max(0, callIdx - 800);
      const ctxEnd = Math.min(raw.length, i + 200);
      const callCtx = raw.slice(ctxStart, ctxEnd);
      expect(
        callCtx,
        'createMcpStdioClient 调用点紧邻注释必含 "cs-round-023"(commit 锚点)',
      ).toMatch(/cs-round-023/);
    });
  });

  // ── Scenario 2: 回归 — streamText 仍不绑 req.signal(W11 invariant 一致性) ──
  describe('Scenario 2: streamText 体内仍不绑 req.signal(W11 invariant)', () => {
    it('Then streamText({...}) 体内不应出现 abortSignal: req.signal / signal: req.signal', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 找到 streamText({...}) 调用(可能是直接调用,也可能被包在 buildStream / withStreamRetry 里)
      // 取最近的 streamText 调用,从它往后到第一个匹配深度的 `})`
      const streamTextIdx = code.search(/streamText\s*\(\s*\{/);
      expect(streamTextIdx, 'streamText({...}) 调用必须存在').toBeGreaterThanOrEqual(0);

      // 从开括号后 brace-count 抠出整个对象字面量
      const openBraceIdx = code.indexOf('{', streamTextIdx);
      let depth = 1;
      let i = openBraceIdx + 1;
      while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const streamTextBody = code.slice(openBraceIdx + 1, i - 1);

      // 反向断言:streamText 体内不应出现 `abortSignal: req.signal`
      expect(
        streamTextBody,
        'streamText({...}) 体内不应包含 `abortSignal: req.signal`(W11 invariant)',
      ).not.toMatch(/abortSignal:\s*req\.signal/);

      // 反向断言:streamText 体内不应出现 `signal: req.signal`
      expect(
        streamTextBody,
        'streamText({...}) 体内不应包含 `signal: req.signal`(W11 invariant)',
      ).not.toMatch(/\bsignal:\s*req\.signal/);
    });
  });
});