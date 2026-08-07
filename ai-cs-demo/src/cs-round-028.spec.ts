/**
 * @status accepted
 * @change-id cs-round-028
 *
 * cs-round-028:架构层面消除 ghost 占位 race window — 不预占位,首 chunk INSERT
 *
 * Why(为什么做):
 *   用户报「发消息 → 立即刷新 → 右框出现 AI_NoOutputGeneratedError」。根因不在
 *   cs-round-024/026/027 任何一个补丁上,而在**架构层的 race window**:
 *
 *     1. BFF 在 streamText 启动之前(chat/route.ts:486-504)主动 appendMessage
 *        一条 status=2 content='' 的 ghost 占位行
 *     2. cs-round-002 reaper 5 分钟阈值救不了 30 秒刷新场景
 *     3. refetch-history.ts:43-56 对任何 status=2 都打 isStreaming=true(不查 content
 *        是否空)→ ghost 占位 100% 触发 useAutoResumeStreaming
 *     4. 续推 → in-flight Map miss → fall-through 调新 streamText → 浏览器 fetch
 *        又断开 → 0 chunk → AI_NoOutputGeneratedError
 *
 *   本 spec 架构层面消除 race window:**BFF 不再预占位,改为 streamText 第一个
 *   chunk 抵达时才 INSERT assistant row**。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — 反向断言预占位 INSERT 块在 streamText 启动前不存在
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  `streamText` 启动**之前**的区域里,**不应**再出现
 *           `appendMessage({role:assistant, status:2, content:'', parts:[]})`
 *           形式的占位 INSERT(grep 反向断言)
 *
 *   Scenario 2: 源码契约 — 正向断言 onChunk 内含 first-chunk INSERT
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  `onChunk` 回调内必须出现 first-chunk INSERT 调用
 *           (grep 正向断言 `appendMessage` + `status:2` + role=assistant
 *           出现在 onChunk 回调范围内)
 *
 *   Scenario 3: 串行化机制 — lastPatchInFlight 链头部包含 INSERT
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  `lastPatchInFlight = lastPatchInFlight.then(...)` 链中,first-chunk INSERT
 *           调用必须出现在该链的 `.then(async () => {` 块内(确保 INSERT 完成前
 *           后续 PATCH 不会因 assistantMsgId=-1 而 skip)
 *
 *   Scenario 4: flushPatch 守卫保留 — assistantMsgId<=0 时 skip PATCH
 *     Given ai-cs-demo/src/app/api/chat/route.ts flushPatch 实现
 *     Then  函数体必含 `if (sessionId <= 0 || assistantMsgId <= 0) return` 守卫
 *
 *   Scenario 5: 回归 — cs-round-024 tee+bgdrain + cs-round-026 Map 机制不损坏
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  cs-round-024 模块:drainForever 函数 + uiStream 三路 tee + writer.merge
 *           (clientStream) 仍在(grep 正向断言)
 *     And   cs-round-026 模块:模块级 `inFlightGenerations: Map<number, InFlightEntry>`
 *           仍在(grep 正向断言)
 *
 * Out of scope:
 * - 真实运行 streamText / 调 LLM / 时序测试(本 spec 仅静态源码契约)
 * - backend appendMessage / reaper 行为(由 erp-admin-backend/test/cs-round-028.e2e-spec.ts 验证)
 * - 跨包 user-visible spec(由 tests/_specs/cs-round-028.spec.ts 验证)
 * - useAutoResumeStreaming 触发条件(由 refetch-history + cs-round-021 验证)
 * - cs_message schema(不动)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-028.spec.ts,验证 5 处源码契约。
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

/** 抠出函数体范围 — 用 `=>` 锚定位 arrow 函数体的 `{`,brace counting */
function extractFnBody(src: string, fnStartIdx: number): string {
  // 先找 `=>`(arrow 函数体前缀),跳过形参列表中的 `{`(destructure)
  const arrowIdx = src.indexOf('=>', fnStartIdx);
  // 再找 `=>` 后第一个 `{` — 这是函数体真正的 open brace
  const openBraceOffset = src.indexOf('{', arrowIdx);
  let depth = 1;
  let i = openBraceOffset + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return src.slice(openBraceOffset, i);
}

describe('cs-round-028: 不预占位,首 chunk INSERT(BFF 源码契约)', () => {
  // ── Scenario 1: 反向断言 — streamText 启动前不应再出现预占位 INSERT 块 ──
  describe('Scenario 1: streamText 启动前不应再出现预占位 INSERT 块(grep 反向断言)', () => {
    it('Then chat/route.ts 中,在 streamText 构造之前不应再 appendMessage({role:assistant, status:2, content:""}) 占位块', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 找到 `const result = streamText(` 同步构造点的索引
      const streamTextIdx = code.search(/\bstreamText\s*\(\s*\{/);
      expect(streamTextIdx, 'streamText({...}) 同步构造必须存在').toBeGreaterThanOrEqual(0);

      // 抠出 streamText 之前的「持久化准备」区域
      const beforeStreamText = code.slice(0, streamTextIdx);

      // 反向断言:这块区域里不应再出现
      //   appendMessage(sessionId, { role: 'assistant', content: '', parts: [], status: 2 })
      // 形式的预占位 INSERT(跨行 / 多行空白都允许,正则宽松)
      expect(
        beforeStreamText,
        'streamText 之前的区域不应再出现 assistant 占位 INSERT 块(csr028 消除预占位)',
      ).not.toMatch(
        /appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,400}role\s*:\s*['"]assistant['"][\s\S]{0,400}status\s*:\s*2/,
      );

      // 进一步收紧:content:'' 模式明确禁止
      expect(
        beforeStreamText,
        'streamText 之前不应再出现 `content: ""` 的 assistant 占位 INSERT 块',
      ).not.toMatch(
        /appendMessage\s*\([\s\S]{0,500}role\s*:\s*['"]assistant['"][\s\S]{0,500}content\s*:\s*['"]['"][\s\S]{0,400}status\s*:\s*2/,
      );
    });
  });

  // ── Scenario 2: 正向断言 — onChunk 内含 first-chunk INSERT ──
  describe('Scenario 2: onChunk 内必须包含 first-chunk INSERT 调用', () => {
    it('Then onChunk 回调内必须出现 appendMessage({role:assistant, status:2, content:accumulatedText, ...})', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 找 `onChunk:` 起始位置
      const onChunkIdx = code.search(/onChunk\s*:\s*\(/);
      expect(onChunkIdx, 'onChunk 回调必须存在').toBeGreaterThanOrEqual(0);

      // onChunk 回调的 body — brace counting
      // onChunk: ({ chunk }) => { ... } — 找到第一个 `{`
      const body = extractFnBody(code, onChunkIdx);
      // strip 到下一个明显的 callback 前(onFinish / onStepFinish / onAbort)
      // 这里我们只验证 body 内部包含 INSERT,所以不用精切

      // 正向断言:body 内必须出现 assistant INSERT + status:2
      expect(
        body,
        'onChunk 内必须包含 appendMessage({role:assistant, status:2, ...}) first-chunk INSERT',
      ).toMatch(
        /appendMessage\s*\([\s\S]{0,300}role\s*:\s*['"]assistant['"][\s\S]{0,500}status\s*:\s*2/,
      );

      // 进一步:INSERT 必出现在 `if (assistantMsgId <= 0` 守卫里(避免每次 chunk 都 INSERT)
      expect(
        body,
        'first-chunk INSERT 必出现在 `if (assistantMsgId <= 0 ...)` 守卫内,只在第一次触发',
      ).toMatch(/assistantMsgId\s*<=\s*0/);
    });
  });

  // ── Scenario 3: 串行化 — lastPatchInFlight 链头部包含 INSERT ──
  describe('Scenario 3: lastPatchInFlight.then(...) 串行链头部包含 INSERT', () => {
    it('Then first-chunk INSERT 必须被并入 lastPatchInFlight.then(...) 链,保证后续 PATCH 等到 INSERT 完成', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 找 onChunk body,然后在里面找包含 appendMessage 的 lastPatchInFlight.then(...) 链
      //   注意:flushPatch 也用 lastPatchInFlight.then,但它的链调 updateMessage 不是
      //   appendMessage。所以先定位 onChunk,再在 onChunk body 内找。
      const onChunkIdx = code.search(/onChunk\s*:\s*\(/);
      expect(onChunkIdx, 'onChunk 回调必须存在').toBeGreaterThanOrEqual(0);
      const arrowIdx = code.indexOf('=>', onChunkIdx);
      const openBraceIdx = code.indexOf('{', arrowIdx);
      let depth = 1;
      let i = openBraceIdx + 1;
      while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const onChunkBody = code.slice(openBraceIdx, i);

      // 在 onChunk body 内找 first-chunk INSERT 的 lastPatchInFlight.then(...) 链
      const thenIdx = onChunkBody.indexOf('lastPatchInFlight.then');
      expect(thenIdx, 'first-chunk INSERT 必须并入 lastPatchInFlight 链').toBeGreaterThanOrEqual(0);
      const thenArrowIdx = onChunkBody.indexOf('async', thenIdx);
      const thenOpenBraceIdx = onChunkBody.indexOf('{', thenArrowIdx);
      let d = 1;
      let j = thenOpenBraceIdx + 1;
      while (j < onChunkBody.length && d > 0) {
        const ch = onChunkBody[j];
        if (ch === '{') d++;
        else if (ch === '}') d--;
        j++;
      }
      const insertBlock = onChunkBody.slice(thenOpenBraceIdx, j);

      // INSERT 串行链体内必含 appendMessage + status: 2
      expect(insertBlock, 'INSERT 串行链体内必含 appendMessage').toMatch(/appendMessage/);
      expect(insertBlock, 'INSERT 串行链体内必含 status: 2').toMatch(/status\s*:\s*2/);
    });
  });

  // ── Scenario 4: flushPatch 守卫保留 ──
  describe('Scenario 4: flushPatch 守卫保留 — assistantMsgId<=0 时 skip PATCH', () => {
    it('Then flushPatch 函数体必含 `if (sessionId <= 0 || assistantMsgId <= 0) return` 守卫', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 找 flushPatch 函数**定义**(`const flushPatch = (status: number) => {`),
      // 不能用 `\bflushPatch\s*\(`(会撞 `flushPatch(2)` 调用点,后续 brace counting
      // 抓出 wrappedTools 块体而非 flushPatch 块体)。
      const flushPatchIdx = code.search(/\bflushPatch\s*=\s*\(/);
      expect(flushPatchIdx, 'flushPatch 函数定义必须存在').toBeGreaterThanOrEqual(0);

      const body = extractFnBody(code, flushPatchIdx);

      // 守卫必含
      expect(
        body,
        'flushPatch 必含 `assistantMsgId <= 0` 守卫(INSERT in-flight 期间不漏 PATCH)',
      ).toMatch(/assistantMsgId\s*<=\s*0/);
    });
  });

  // ── Scenario 5: 回归 — cs-round-024 tee+bgdrain + cs-round-026 Map 不损坏 ──
  describe('Scenario 5: 回归 — cs-round-024 tee+bgdrain + cs-round-026 Map 机制仍存在', () => {
    it('Then drainForever 函数 + uiStream 三路 tee + writer.merge(clientStream) + inFlightGenerations Map 仍存在', () => {
      const code = readCode('src/app/api/chat/route.ts');
      const raw = readRaw('src/app/api/chat/route.ts');

      // ── cs-round-024 回归 ──
      // drainForever 函数仍存在
      expect(
        code,
        'cs-round-024 回归:drainForever 函数仍存在',
      ).toMatch(/function\s+drainForever\s*\(\s*stream\s*:\s*ReadableStream\s*\)/);

      // uiStream 三路 tee 仍存在
      expect(
        code,
        'cs-round-024 回归:uiStream 三路 tee([clientStream, broadcastStream] / [drainBranch, mapBranch])仍存在',
      ).toMatch(/\[clientStream,\s*broadcastStream\]\s*=\s*uiStream\.tee\s*\(\s*\)/);
      expect(
        code,
        'cs-round-024 回归:第二次 tee 拆 drainBranch + mapBranch',
      ).toMatch(/\[drainBranch,\s*mapBranch\]\s*=\s*broadcastStream\.tee\s*\(\s*\)/);

      // writer.merge(clientStream) 仍存在(原始路径)
      expect(
        code,
        'cs-round-024 回归:writer.merge 必须用 clientStream(不是 uiStream)',
      ).toMatch(/writer\.merge\s*\(\s*clientStream\s*\)/);

      // ── cs-round-026 回归 ──
      // 模块级 inFlightGenerations Map 仍存在
      expect(
        code,
        'cs-round-026 回归:模块级 inFlightGenerations Map 仍存在',
      ).toMatch(
        /const\s+inFlightGenerations\s*=\s*new\s+Map\s*<\s*number\s*,\s*InFlightEntry\s*>\s*\(\s*\)/,
      );

      // inFlightGenerations.set(assistantMsgId, ...) 仍存在
      expect(
        code,
        'cs-round-026 回归:inFlightGenerations.set(assistantMsgId, ...) 仍存在',
      ).toMatch(/inFlightGenerations\.set\s*\(\s*assistantMsgId\s*,/);

      // inFlightGenerations.delete(assistantMsgId) 仍存在(grep raw 算次数)
      const deleteMatches = raw.match(/inFlightGenerations\.delete\s*\(\s*assistantMsgId\s*\)/g) ?? [];
      expect(
        deleteMatches.length,
        'cs-round-026 回归:inFlightGenerations.delete(assistantMsgId) 至少 1 处',
      ).toBeGreaterThanOrEqual(1);

      // 续推命中分支:get(assistantMsgId) 仍存在
      expect(
        code,
        'cs-round-026 回归:续推命中分支 `inFlightGenerations.get(assistantMsgId)` 仍存在',
      ).toMatch(/inFlightGenerations\.get\s*\(\s*assistantMsgId\s*\)/);

      // stale sweep 兜底仍存在
      expect(
        code,
        'cs-round-026 回归:stale entry 兜底(60s 扫 5min 阈值)仍存在',
      ).toMatch(/STALE_INFLIGHT_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    });
  });
});