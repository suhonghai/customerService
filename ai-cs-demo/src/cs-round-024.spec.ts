/**
 * @status draft
 * @change-id cs-round-024
 *
 * cs-round-024: writer.merge + tee 隔离 cancel 传播(客户端刷新不再触发 AI_NoOutputGeneratedError)
 *
 * Why(为什么做):
 * 用户报「问完问题立即刷新页面,流式接口报 AI_NoOutputGeneratedError」。cs-round-023
 * 修了 MCP client 那一支(createMcpStdioClient 不再绑 req.signal),但 cancel 传播还有
 * 另一支独立的路径:`writer.merge(uiStream)` 走 outer stream pipe chain(clientStream
 * 经 createUIMessageStreamResponse 的 JsonToSse + TextEncoder 推到 Response body)。
 * client disconnect 时 outer pipe chain 被 cancel,沿 writer.merge → uiStream 传到
 * streamText,streamText 提前终止 → 0 chunk → AI SDK 抛 AI_NoOutputGeneratedError →
 * onError PATCH status=4 → 前端看到 error type chunk + status=4(误导)。
 *
 * 修法:`uiStream.tee()` 拆成 clientStream + bgStream 两路 —— client 走 writer.merge
 * (可被 cancel),后台 fire-and-forget drain bgStream(永不 cancel,持续 read 把 source
 * streamText 续命)。Web Streams spec:tee 后所有分支关闭 source 才完结;后台 drain 持续
 * read → source 不会被全部 cancel → streamText 自然跑完 → onFinish → PATCH status=1。
 *
 * 复现场景:用户问完问题立即刷新页面 → client disconnect → outer pipe chain cancel
 *   → clientStream 被 cancel(merge 任务 resolve,safeEnqueue 吞错)→ bgStream 仍在
 *   read → source 继续推 chunk → streamText 自然跑完 → DB 落 status=1 → 用户再进
 *   同一 URL 看到完整答案。**不再**触发 AI_NoOutputGeneratedError → 不再有 error
 *   type chunk → 不再有 status=4。
 *
 * 与 cs-round-023 的关系:cs-round-023 修 MCP client 不绑 req.signal(同一条 bug 链路
 *   的另一个入口);cs-round-024 堵 outer pipe chain 这一支。两支都堵了,client disconnect
 *   才能真正不再误报 AI_NoOutputGeneratedError。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — tee + bg drain 存在
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  `uiStream` 那一行附近必须出现 `uiStream.tee()` 调用(grep 验证)
 *     And   同区域内必须出现 `bgStream` 变量声明(`const [clientStream, bgStream] = uiStream.tee()`)
 *     And   同区域内必须出现 `void (async () => {` 启后台 drain 的形态
 *     And   该区域内必须包含 `cs-round-024` 字样(commit 锚点)
 *     And   `writer.merge` 调用必须用 `clientStream` 而非 `uiStream`
 *           (反向断言:grep 不应再出现 `writer.merge(uiStream)`)
 *
 *   Scenario 2: 行为契约 — bg drain 永不 throw
 *     Given uiStream.tee() 拆出的 bgStream 后台 drain 异步函数
 *     Then  该 async 函数体内不应出现 `throw`(grep 反向断言)
 *     And   必须用 try/catch 把 reader.read() 包起来(grep 验证 catch 块存在)
 *     And   必须调用 reader.releaseLock()(grep 验证释放锁)
 *
 *   Scenario 3: W11 invariant 回归
 *     Given chat/route.ts 里 streamText 调用和 MCP client 调用
 *     Then  createMcpStdioClient 调用点不应再含 `abortSignal: req.signal`(回归 cs-round-023)
 *     And   streamText 调用体内不应出现 `abortSignal: req.signal` 或 `signal: req.signal`
 *           (回归 W11 invariant)
 *
 * Out of scope:
 * - writer.merge 实现本身(ai/dist/index.mjs:8885-8901,getReader()+read() 而非 pipeTo,
 *   cancel 沿 outer pipe chain 传播而非直接传 merge)— 不动
 * - createUIMessageStreamResponse 的 outer pipe chain(JsonToSse + TextEncoder)— 不动
 * - createMcpStdioClient 实现本身(mcp-client.ts 接口里仍保留 abortSignal?: AbortSignal
 *   可选字段以兼容其他调用方)— 不动
 * - escalate/route.ts 中 createMcpStdioClient 的调用 — 不动
 * - useAutoResumeStreaming / refetch-history / useChatState(都是上游 cs-round 修过的)
 * - 后端 NestJS / cs_message schema — 不动
 * - placeholder stuck status=2 / id=290-style 孤儿 — 不是本 PR scope
 *
 * 落点:co-located ai-cs-demo/src/cs-round-024.spec.ts,
 *      验证 3 处源码契约(tee+drain 调用形态 + bg drain 行为 + W11 invariant 回归)。
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

describe('cs-round-024: writer.merge + tee 隔离 cancel 传播(客户端刷新不再触发 AI_NoOutputGeneratedError)', () => {
  // ── Scenario 1: 源码契约 — tee + bg drain 存在 ──
  describe('Scenario 1: uiStream.tee() + 后台 drain 形态存在', () => {
    it('Then uiStream 附近必须有 tee() / bgStream / 后台 drain / cs-round-024 锚点,且 writer.merge 必须用 clientStream', () => {
      const raw = readRaw('src/app/api/chat/route.ts');

      // 找到 uiStream.tee() 调用点(用 raw,因为注释里也有这个名字提及)
      const teeIdx = raw.search(/uiStream\.tee\s*\(\s*\)/);
      expect(teeIdx, 'uiStream.tee() 调用必须存在').toBeGreaterThanOrEqual(0);

      // 抠出 tee 调用点 ±3500 字符(tee + bg drain + writer.merge;comments 占大头)
      const ctxStart = Math.max(0, teeIdx - 200);
      const ctxEnd = Math.min(raw.length, teeIdx + 3500);
      const uiStreamCtx = raw.slice(ctxStart, ctxEnd);

      // tee() 必须存在
      expect(
        uiStreamCtx,
        'uiStream 之后必须出现 uiStream.tee() 调用',
      ).toMatch(/uiStream\.tee\s*\(\s*\)/);

      // bgStream 必须出现
      expect(
        uiStreamCtx,
        'uiStream 之后必须出现 bgStream 变量声明',
      ).toMatch(/\bbgStream\b/);

      // 后台 drain 形态:`void (async () => {`
      expect(
        uiStreamCtx,
        'uiStream 之后必须出现 `void (async () => {` 启后台 drain',
      ).toMatch(/void\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/);

      // cs-round-024 锚点
      expect(
        uiStreamCtx,
        'uiStream 区域内必须包含 cs-round-024 字样(commit 锚点)',
      ).toMatch(/cs-round-024/);

      // writer.merge 必须用 clientStream 而非 uiStream
      // 反向断言:strip 注释后的 code 不应再出现 `writer.merge(uiStream)`
      // (注释里可以提到「原 writer.merge(uiStream)」作为反向证据)
      const code = readCode('src/app/api/chat/route.ts');
      expect(
        code,
        'writer.merge 调用不应再出现 `writer.merge(uiStream)`(必须改用 clientStream)',
      ).not.toMatch(/writer\.merge\s*\(\s*uiStream\s*\)/);

      // 正向断言:writer.merge(clientStream) 必须存在
      expect(
        code,
        'writer.merge 必须用 clientStream(正向断言)',
      ).toMatch(/writer\.merge\s*\(\s*clientStream\s*\)/);
    });
  });

  // ── Scenario 2: 行为契约 — bg drain 永不 throw ──
  describe('Scenario 2: 后台 drain 永不 throw 且 release lock', () => {
    it('Then 后台 drain async 函数体内不 throw,必包 try/catch,必 releaseLock()', () => {
      const raw = readRaw('src/app/api/chat/route.ts');

      // 找到 `void (async () => {` 那一段(后台 drain 起点)
      const drainStart = raw.search(/void\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/);
      expect(drainStart, '后台 drain `void (async () => {` 必须存在').toBeGreaterThanOrEqual(0);

      // 找到 drain 闭合 `})();` — 这是 void (async () => {...})() 的结尾
      // 用 brace-count 抠出 IIFE 函数体范围:从 drainStart 的 `{` 到对应 `}`
      const openBraceOffset = raw.indexOf('{', drainStart);
      let depth = 1;
      let i = openBraceOffset + 1;
      while (i < raw.length && depth > 0) {
        const ch = raw[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      // i 现在指向配对 `}` 之后;再加 1 是 `)` 再 1 是 `;`,我们只要到 `}` 为止
      const drainCtx = raw.slice(drainStart, i);

      // 必含 catch(包 reader.read)
      expect(
        drainCtx,
        '后台 drain 必须有 catch 块(包 reader.read 错误)',
      ).toMatch(/\bcatch\b/);

      // 必含 try(否则 catch 无效)
      expect(
        drainCtx,
        '后台 drain 必须有 try(否则 catch 无效)',
      ).toMatch(/\btry\b/);

      // 必含 releaseLock
      expect(
        drainCtx,
        '后台 drain 必须调用 reader.releaseLock()',
      ).toMatch(/reader\.releaseLock\s*\(\s*\)/);

      // 反向断言:drain 函数体内不应出现真实 throw 语句
      // 注释里有「raise」「raise」等英文/中文都可能;只看代码 throw 的实际语句形式
      // — `throw ` 后必跟表达式:`throw new X` / `throw err` / `throw X;`
      // — 排除注释:仅取代码 token,跳过 // 行尾 / 块注释
      const codeLines = drainCtx.split('\n').filter((line) => {
        const t = line.trimStart();
        return !t.startsWith('//');
      });
      const codeOnly = codeLines.join('\n');
      // 真实 throw 语句:`throw ` 后接标识符 / `new` / `{` / 引号
      const throwMatches = codeOnly.match(/throw\s+(new\s+|[A-Za-z_$]|[\{\"'])/g) ?? [];
      expect(
        throwMatches.length,
        '后台 drain 函数体内不应出现真实 `throw` 语句(只 drain,无需 raise)',
      ).toBe(0);
    });
  });

  // ── Scenario 3: W11 invariant 回归 ──
  describe('Scenario 3: W11 invariant 回归(cs-round-023 不被回退)', () => {
    it('Then createMcpStdioClient 不绑 req.signal + streamText 不绑 req.signal', () => {
      const code = readCode('src/app/api/chat/route.ts');
      const raw = readRaw('src/app/api/chat/route.ts');

      // ── 3a. createMcpStdioClient 不绑 req.signal ──
      const callIdx = raw.search(/createMcpStdioClient\s*\(/);
      expect(callIdx, 'createMcpStdioClient 调用必须存在').toBeGreaterThanOrEqual(0);

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

      expect(
        callExpr,
        'createMcpStdioClient 调用点不应包含 `abortSignal: req.signal`(W11 invariant)',
      ).not.toMatch(/abortSignal:\s*req\.signal/);

      // ── 3b. streamText 体内不绑 req.signal ──
      const streamTextIdx = code.search(/streamText\s*\(\s*\{/);
      expect(streamTextIdx, 'streamText({...}) 调用必须存在').toBeGreaterThanOrEqual(0);

      const openBraceIdx = code.indexOf('{', streamTextIdx);
      depth = 1;
      i = openBraceIdx + 1;
      while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const streamTextBody = code.slice(openBraceIdx + 1, i - 1);

      expect(
        streamTextBody,
        'streamText({...}) 体内不应包含 `abortSignal: req.signal`(W11 invariant)',
      ).not.toMatch(/abortSignal:\s*req\.signal/);

      expect(
        streamTextBody,
        'streamText({...}) 体内不应包含 `signal: req.signal`(W11 invariant)',
      ).not.toMatch(/\bsignal:\s*req\.signal/);
    });
  });
});