/**
 * @status implemented
 * @change-id cs-round-026
 * // @cross-package: ai-cs
 *
 * cs-round-026:续推接口不再触发"双 LLM 生成"。
 *
 * Why:
 *   cs-round-011 实现 continueFromMessageId 路径时,resume 请求会重新调一次 streamText。
 *   配合 cs-round-023/024 的"原 streamText 不被打断"机制,场景 B(立即刷新)变成:
 *   原 streamText + resume streamText **同时跑**同一个 assistantMsgId,两个 writer
 *   flushPatch(2) 抢同一行 DB,内容抖动 + LLM token 双倍费用 + status 字段可能
 *   从 1 → 2 → 1 来回翻转(用户最在意这条)。
 *
 *   C 方案(csr026):同一 assistantMsgId 仅允许一个 streamText 在跑。
 *   ai-cs-demo 路由层维护模块级 `inFlightGenerations: Map<assistantMsgId, InFlightEntry>`,
 *   InFlightEntry 含 uiStream + finishedPromise。
 *   - Original /api/chat:streamText 启动前 register,onFinish/onError 时 unregister。
 *   - Resume /api/chat(continueFromMessageId > 0):先查 map,命中 → tee 转发 uiStream,
 *     跳过 buildStream + withStreamRetry + result.text await + flushPatch 整段;未命中
 *     → fall through 走原 buildStream 路径(csr011 行为,作为"原 streamText 已死"的兜底)。
 *
 * 契约(跨 ai-cs 单包,根 spec 守门):
 *   A. chat/route.ts 顶部声明模块级 `inFlightGenerations` Map。
 *   B. continueFromMessageId > 0 分支处理 existing message 后,必须先查 inFlightGenerations
 *      .get(assistantMsgId) — 命中时走转发分支,跳过 buildStream 调用。
 *   C. 转发分支必须 tee InFlightEntry.stream + drain + writer.merge(不重调 LLM)。
 *   D. 转发分支不调 buildStream / withStreamRetry / result.text await / flushPatch
 *      (避免与原请求抢同一 DB row)。
 *   E. Original 路径 streamText 启动前 register,onFinish / onError / onAbort cleanup。
 *   F. erp-admin-backend schema/接口不变(只 ai-cs 单包改动),由 cs-round-011 已有的
 *      jest e2e spec(backend/test/cs-round-011.e2e-spec.ts)继续守 continueFromMessageId
 *      status=2/4 校验路径,无需新加后端 spec。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行,保留真实代码(同 cs-round-014 / 016)
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

/**
 * 抠出 continueFromMessageId 整个 if 块(从 `if (typeof body.continueFromMessageId === 'number')`
 * 开始,到 `} else {`(对应 placeholder 创建块))。
 * 用于精准 grep 续推分支内部的代码,避免被文件其它区域污染。
 */
function extractContinueFromBlock(code: string): string {
  const startRe = /if\s*\(\s*typeof\s+body\.continueFromMessageId\s*===\s*['"]number['"]/;
  const m = code.match(startRe);
  if (!m || m.index === undefined) return '';
  let i = m.index;
  // 用 brace counter 抠到匹配的 `}` 之后的 `else {`
  let braceDepth = 0;
  let started = false;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '{') {
      braceDepth++;
      started = true;
    } else if (ch === '}') {
      braceDepth--;
      if (started && braceDepth === 0) {
        // 找到匹配 `}`,include 后面的 `else {` 直到 else 块的 `{`
        const elseStart = code.indexOf('else', i);
        if (elseStart > 0 && elseStart < i + 20) {
          // 把 else { 整个块也算进范围(便于看未命中分支也有 buildStream)
          let elseBraceDepth = 0;
          let j = elseStart;
          let elseStarted = false;
          while (j < code.length) {
            const c2 = code[j];
            if (c2 === '{') {
              elseBraceDepth++;
              elseStarted = true;
            } else if (c2 === '}') {
              elseBraceDepth--;
              if (elseStarted && elseBraceDepth === 0) return code.slice(m.index, j + 1);
            }
            j++;
          }
        }
        return code.slice(m.index, i + 1);
      }
    }
    i++;
  }
  return '';
}

/**
 * 抠出 onError 块(无论单行 arrow `=> expr` 还是块 `=> { ... }`)。
 * 用于 grep cleanup call。
 */
function extractOnErrorBlock(code: string): string {
  // 找所有 `onError: (` 起点,取最后一个(原始 path 的块 onError,不是 resume 转发里
  // 的单行 serializeError)
  const matches = [...code.matchAll(/onError\s*:\s*\(/g)];
  if (matches.length === 0) return '';
  // 从最后一个 onError 开始抠 — 原始 path 的 block-form onError
  const last = matches[matches.length - 1];
  const start = last.index ?? 0;
  // 用 brace counter 找 `=> { ... }` 形式
  const after = code.slice(start);
  const blockMatch = after.match(/=>\s*\{/);
  if (!blockMatch || blockMatch.index === undefined) {
    // 单行 arrow:抠到下一个 `,` 或 `}` 即可
    const lineEnd = after.indexOf(',');
    const blockEnd = after.indexOf('}');
    const end = Math.min(
      lineEnd > 0 ? lineEnd : Infinity,
      blockEnd > 0 ? blockEnd : Infinity,
    );
    return after.slice(0, end);
  }
  let braceDepth = 1;
  let i = blockMatch.index + blockMatch[0].length;
  while (i < after.length && braceDepth > 0) {
    const ch = after[i];
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
    i++;
  }
  return after.slice(0, i);
}

describe('cs-round-026: 同 assistantMsgId 仅一个 streamText 在跑(续推转发不重调 LLM)', () => {
  // ── 契约 A:模块级 inFlightGenerations Map 声明 ──
  describe('Given: chat/route.ts 顶部模块级 state', () => {
    it('Then: 必须声明模块级 `inFlightGenerations` Map,且 key 是 number(assistantMsgId)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      const mapDecl = codeOnly.match(
        /\b(?:const|let|var)\s+inFlightGenerations\s*[:=]\s*new\s+Map\s*<\s*number\s*,/m,
      );
      expect(
        mapDecl?.[0] ?? '',
        'route.ts 顶部必须声明模块级 Map<number, ...> inFlightGenerations',
      ).toBeTruthy();
    });
  });

  // ── 契约 B + C:continueFromMessageId 路径必须先查 Map,命中走转发分支 ──
  describe('Given: chat/route.ts continueFromMessageId 处理块', () => {
    it('Then: continueFromMessageId 块内必须查 inFlightGenerations[assistantMsgId]', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);
      const continueFromBlock = extractContinueFromBlock(codeOnly);
      expect(
        continueFromBlock,
        '应能抠出 continueFromMessageId 整块(到 placeholder 创建的 else {)',
      ).not.toBe('');

      // 必须在 continueFrom 块内查 inFlightGenerations[assistantMsgId]
      const lookup = continueFromBlock.match(
        /inFlightGenerations\.(?:get|has)\s*\(\s*assistantMsgId\s*\)/,
      );
      expect(
        lookup?.[0] ?? '',
        'continueFromMessageId 路径必须查 inFlightGenerations[assistantMsgId]',
      ).toBeTruthy();
    });

    it('Then: continueFrom 块内必须 tee 入参 stream + drain bg + writer.merge(转发而非重生成)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);
      const continueFromBlock = extractContinueFromBlock(codeOnly);
      expect(continueFromBlock).not.toBe('');

      // 命中分支必须 tee 一个变量的 .stream 字段 — 接受任意变量名(不锁 Entry 字面量)
      const teeOfStream = continueFromBlock.match(
        /\b(?:const|let)\s*\[\s*\w+\s*,\s*\w+\s*\]\s*=\s*\w+(?:\??\.\w+)*\.stream\.tee\s*\(\s*\)/,
      );
      expect(
        teeOfStream?.[0] ?? '',
        'inFlight 命中分支必须对 entry.stream 做 tee(转发而非重生成)',
      ).toBeTruthy();

      // 命中分支必须 writer.merge(clientStream) — 把转发 chunk 推到 SSE
      const mergeClient = continueFromBlock.match(/writer\.merge\s*\(\s*\w+\s*\)/);
      expect(
        mergeClient?.[0] ?? '',
        '转发分支必须 writer.merge(clientStream) 把转发 chunk 推到 SSE',
      ).toBeTruthy();

      // 必须显式 early return — 否则会落到 buildStream 路径
      const hasEarlyReturn = /return\s+createUIMessageStreamResponse/.test(continueFromBlock);
      expect(
        hasEarlyReturn,
        'inFlight 命中分支必须 early return createUIMessageStreamResponse',
      ).toBe(true);
    });

    it('Then: continueFrom 块内的 inFlight 命中分支不能调 buildStream / withStreamRetry / flushPatch', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);
      const continueFromBlock = extractContinueFromBlock(codeOnly);
      expect(continueFromBlock).not.toBe('');

      // 命中分支(inFlightGenerations.get 之后到 return)内不应有 buildStream
      const inFlightIdx = continueFromBlock.indexOf('inFlightGenerations.get');
      const returnIdx = continueFromBlock.indexOf('return createUIMessageStreamResponse');
      expect(inFlightIdx).toBeGreaterThanOrEqual(0);
      expect(returnIdx).toBeGreaterThan(inFlightIdx);
      const hitBranch = continueFromBlock.slice(inFlightIdx, returnIdx);

      expect(
        hitBranch,
        '命中分支不能调 buildStream(否则重生成 LLM)',
      ).not.toMatch(/\bbuildStream\s*\(/);
      expect(
        hitBranch,
        '命中分支不能调 withStreamRetry(否则触发重生成 retry)',
      ).not.toMatch(/\bwithStreamRetry\b/);
      expect(
        hitBranch,
        '命中分支不能调 flushPatch(否则与原请求抢 DB row)',
      ).not.toMatch(/\bflushPatch\s*\(/);
      expect(
        hitBranch,
        '命中分支不能 await result.text(原请求已 await)',
      ).not.toMatch(/\bresult\.text\b/);
    });
  });

  // ── 契约 D:原路径必须有 flushPatch(回归 cs-round-011 / W11 streaming persistence) ──
  describe('Given: chat/route.ts flushPatch 调用面', () => {
    it('Then: 原路径必须仍调 flushPatch(原 streamText 还在跑 → 仍写 DB)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 文件内必须有 buildStream 调用,以及 flushPatch 调用
      const buildStreamCalls = [...codeOnly.matchAll(/\bbuildStream\s*\(\s*\)/g)];
      const flushPatchCalls = [...codeOnly.matchAll(/\bflushPatch\s*\(/g)];
      expect(
        buildStreamCalls.length,
        '原路径必须仍调 buildStream(兜底走 csr011 行为)',
      ).toBeGreaterThanOrEqual(1);
      expect(
        flushPatchCalls.length,
        '原路径必须仍调 flushPatch(原 streamText 还在跑 → DB 写)',
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 契约 E:Original 路径必须 register,onFinish / onError / onAbort cleanup ──
  describe('Given: chat/route.ts streamText lifecycle hook', () => {
    it('Then: 必须 inFlightGenerations.set(assistantMsgId, ...),且至少 1 处 delete', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 必须有 inFlightGenerations.set 调用
      const setCall = codeOnly.match(/inFlightGenerations\.set\s*\(\s*assistantMsgId\s*,/);
      expect(
        setCall?.[0] ?? '',
        'streamText 启动前必须 inFlightGenerations.set(assistantMsgId, ...)',
      ).toBeTruthy();

      // 必须有 ≥1 处 delete(传 assistantMsgId)— onFinish / onError / onAbort 至少一处
      const deleteCalls = [
        ...codeOnly.matchAll(/inFlightGenerations\.delete\s*\(\s*assistantMsgId\s*\)/g),
      ];
      expect(
        deleteCalls.length,
        'onFinish / onError / onAbort 必须 inFlightGenerations.delete(assistantMsgId)',
      ).toBeGreaterThanOrEqual(1);
    });

    it('Then: onError 块体内必须 cleanup(防 resume 转发死链)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      const onErrorBlock = extractOnErrorBlock(codeOnly);
      expect(
        onErrorBlock,
        '必须能找到 onError 块(block-form 或单行 arrow)',
      ).not.toBe('');
      expect(
        onErrorBlock,
        'onError 块内必须 inFlightGenerations.delete(assistantMsgId)',
      ).toMatch(/inFlightGenerations\.delete\s*\(\s*assistantMsgId\s*\)/);
    });
  });

  // ── 契约 F:后端 schema/接口未变更(回归 cs-round-011) ──
  describe('Given: 后端 cs-round-011 jest e2e spec 守门 continueFromMessageId 路径仍生效', () => {
    it('Then: backend cs-round-011 spec 仍存在且至少 2 个 scenario(覆盖 status=2/4)', () => {
      const specPath = resolve(ROOT, 'erp-admin-backend/test/cs-round-011.e2e-spec.ts');
      expect(existsSync(specPath), 'cs-round-011 后端 spec 应继续存在(回归守门)').toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
    });
  });
});