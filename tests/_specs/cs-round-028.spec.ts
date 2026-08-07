/**
 * @status implemented
 * @change-id cs-round-028
 * // @cross-package: ai-cs,backend
 *
 * cs-round-028:架构层面消除 ghost 占位 race window — 不预占位,首 chunk INSERT
 *
 * Why(为什么做):
 *   用户报「发消息 → 立即刷新 → 右框出现 AI_NoOutputGeneratedError」。诊断发现:
 *   BFF 在 streamText 启动之前(chat/route.ts:486-504)就主动 appendMessage 一条
 *   status=2 content='' 的 ghost 占位行。这条 ghost 行存在一个**架构层 race window**:
 *
 *     1. 占位行写入 DB(status=2 content='' parts=[])
 *     2. refetch-history 对任何 status=2 都打 isStreaming=true(不查 content 是否空)
 *     3. useAutoResumeStreaming 自动续推(POST /api/chat { continueFromMessageId })
 *     4. 续推 → inFlightGenerations Map miss(原 streamText 没跑起来过)→ fall-through
 *        调新 streamText
 *     5. 新 streamText 在生成第一个 chunk 前被浏览器 fetch 断开 → 0 chunk
 *     6. AI_NoOutputGeneratedError → onError PATCH status=4 → UI 看到 error type chunk
 *
 *   cs-round-024/026/027 都没修到这条 race window。cs-round-002 reaper 5 分钟阈值
 *   救不了"30 秒刷新"。**架构层面消除 race window**:BFF 不再预占位,改为 streamText
 *   第一个 chunk 抵达时才 INSERT assistant row。
 *
 *   用户可见效果:
 *     - 首 chunk 抵达前 abort / 刷新 → DB 无 row → 不触发续推死循环
 *     - 首 chunk 抵达后正常流式 → DB 出现 row(status=2 content=首 chunk 文本)
 *     - 续推 / 转人工 / 重试场景不受影响
 *
 * 跨包契约(根 spec 守门):
 *
 *   Scenario 1: 新消息 → 第一个 chunk 抵达前,DB 中**没有** assistant row
 *     (用户刷新时刻早于首 chunk → 不应看到 ghost 占位 → 不应触发续推)
 *
 *   Scenario 2: 新消息 → 第一个 chunk 抵达 → DB 中**出现** assistant row
 *     (status=2, content=首 chunk 文本,parts=[{type:text, text:首 chunk}])
 *
 *   Scenario 3: streamText 0 chunk → DB 中**永远没有** assistant row
 *     (abort 在首 chunk 前 → 无 INSERT → reaper 不动)
 *
 *   Scenario 4: continueFromMessageId 路径不受影响
 *     (续推已有 row,复用 existing.id;不进 onChunk INSERT 路径)
 *
 *   Scenario 5: handoff 路径不受影响
 *     (走 ack status=1,不进 streamText,不进 onChunk INSERT)
 *
 *   Scenario 6: first-chunk INSERT 失败 fallback
 *     (assistantMsgId 保持 -1;后续 flushPatch skip;流继续给浏览器;outer onError
 *      → serializeError → error type chunk 可见)
 *
 *   落地细节:
 *   - ai-cs-demo/src/app/api/chat/route.ts:删除 :486-504 else 块 + onChunk 加
 *     first-chunk INSERT guard(`assistantMsgId <= 0` 守卫内)
 *   - lastPatchInFlight 串行链头部并入 INSERT,保证后续 PATCH 等到 INSERT 完成
 *   - inFlightGenerations Map.register 时机不变;first-chunk INSERT 完成后可 re-key
 *     (留作 follow-up;本 spec 接受 -1 key 暂时无效)
 *   - backend appendMessage / updateMessage / reaper 行为不变(由 cs-round-028 e2e-spec
 *     验证)
 *   - cs_message schema 不动
 *
 * 回归(不应被本 spec 损坏):
 *   - cs-round-002 reaper 5min 阈值
 *   - cs-round-011 续推路径
 *   - cs-round-022 BFF 跳过空 user 消息
 *   - cs-round-024 tee + bgdrain
 *   - cs-round-026 inFlightGenerations Map
 *   - cs-round-027 SSE data: 解析
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行,保留真实代码
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

function readCode(relPath: string): string {
  return stripComments(readFileSync(resolve(ROOT, relPath), 'utf-8'));
}

/** 抠出函数体范围 — 用 `=>` 锚定位 arrow 函数体的 `{`,brace counting */
function extractBody(src: string, anchorIdx: number): string {
  // 先找 `=>`(arrow 函数体前缀),跳过形参列表中的 `{`(destructure)
  const arrowIdx = src.indexOf('=>', anchorIdx);
  expect(arrowIdx, 'extractBody 期望找到 `=>` arrow 函数体锚').toBeGreaterThanOrEqual(0);
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

describe('cs-round-028: 不预占位,首 chunk INSERT(架构层消除 ghost 占位 race window)', () => {
  // ── Scenario 1: 新消息 → 首 chunk 抵达前 DB 中**没有** assistant row ──
  describe('Scenario 1: 新消息,首 chunk 抵达前,DB 中没有 assistant row(grep 反向断言)', () => {
    it('Then chat/route.ts 在 streamText 启动之前不应再 appendMessage({role:assistant, status:2, content:""})', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      // 找到 `const result = streamText(` 同步构造点的索引
      const streamTextIdx = code.search(/\bstreamText\s*\(\s*\{/);
      expect(streamTextIdx, 'streamText({...}) 同步构造必须存在').toBeGreaterThanOrEqual(0);

      // 抠出 streamText 之前的「持久化准备」区域
      const beforeStreamText = code.slice(0, streamTextIdx);

      // 反向断言:预占位 INSERT 块必须不存在
      expect(
        beforeStreamText,
        'cs-round-028 反转:streamText 之前的区域不应再出现 assistant 占位 INSERT 块(消除 race window)',
      ).not.toMatch(
        /appendMessage\s*\([\s\S]{0,500}role\s*:\s*['"]assistant['"][\s\S]{0,500}content\s*:\s*['"]['"][\s\S]{0,400}status\s*:\s*2/,
      );
    });
  });

  // ── Scenario 2: 新消息 → 首 chunk 抵达 → DB 中**出现** assistant row ──
  describe('Scenario 2: 新消息,首 chunk 抵达,DB 中出现 assistant row(grep 正向断言)', () => {
    it('Then onChunk 回调内必须包含 first-chunk INSERT 守卫 + appendMessage', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      const onChunkIdx = code.search(/onChunk\s*:\s*\(/);
      expect(onChunkIdx, 'onChunk 回调必须存在').toBeGreaterThanOrEqual(0);
      const onChunkBody = extractBody(code, onChunkIdx);

      // 正向断言:onChunk body 内必含 INSERT 调用 + status=2
      expect(
        onChunkBody,
        'onChunk 内必须包含 appendMessage({role:assistant, status:2, ...}) first-chunk INSERT',
      ).toMatch(
        /appendMessage\s*\([\s\S]{0,300}role\s*:\s*['"]assistant['"][\s\S]{0,500}status\s*:\s*2/,
      );

      // first-chunk INSERT 必出现在 `if (assistantMsgId <= 0)` 守卫内
      expect(
        onChunkBody,
        'first-chunk INSERT 必出现在 `assistantMsgId <= 0` 守卫内,只在第一次触发',
      ).toMatch(/assistantMsgId\s*<=\s*0/);
    });

    it('And then lastPatchInFlight.then(...) 链头部必串行化 INSERT,保证后续 PATCH 等到 INSERT 完成', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      // 找 `lastPatchInFlight = lastPatchInFlight.then(async () => { ... appendMessage ... })`
      // 形态:链内含 appendMessage + status:2
      const insertChainMatches = [
        ...code.matchAll(
          /lastPatchInFlight\s*=\s*lastPatchInFlight\.then\s*\(\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?appendMessage[\s\S]*?\}\s*\)/g,
        ),
      ];

      expect(
        insertChainMatches.length,
        'lastPatchInFlight.then(...) 链中必含 first-chunk INSERT(串行化协调)',
      ).toBeGreaterThanOrEqual(1);

      const firstChain = insertChainMatches[0][0];
      expect(firstChain, 'INSERT 串行链体内必含 appendMessage + status:2').toMatch(
        /appendMessage[\s\S]*?status\s*:\s*2/,
      );
    });
  });

  // ── Scenario 3: streamText 0 chunk → DB 中**永远没有** assistant row ──
  describe('Scenario 3: streamText 0 chunk(abort 在首 chunk 前)DB 永远无 row', () => {
    it('Then BFF 不预占位,abort 在首 chunk 前 → DB 无 INSERT 调用', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');
      const raw = readFileSync(
        resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts'),
        'utf-8',
      );

      // 验证:整个 route.ts 内只有一处 assistant appendMessage(role=assistant + status=2),
      // 且必须位于 onChunk 回调内(同步阶段预占位 else 块已删除)
      const assistantInsertMatches = [
        ...code.matchAll(
          /appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,400}role\s*:\s*['"]assistant['"][\s\S]{0,400}status\s*:\s*2/g,
        ),
      ];
      expect(
        assistantInsertMatches.length,
        'cs-round-028:全文件 assistant INSERT(status=2)只允许 1 处(onChunk first-chunk),预占位 else 块已删除',
      ).toBe(1);

      // 该唯一一处必须在 onChunk 内
      const insertMatch = assistantInsertMatches[0];
      const onChunkIdx = code.indexOf('onChunk');
      expect(onChunkIdx, 'onChunk 回调必须存在').toBeGreaterThanOrEqual(0);
      const onChunkBody = extractBody(code, onChunkIdx);
      expect(
        onChunkBody,
        'assistant INSERT(status=2)必须位于 onChunk body 内(预占位 else 块已删除)',
      ).toMatch(
        /appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,400}role\s*:\s*['"]assistant['"][\s\S]{0,400}status\s*:\s*2/,
      );

      // 验证:reaper 5min 阈值仍存在(回归 cs-round-002)
      // (reaper 行为不变;本 spec 接受"无 row → reaper 空跑"语义)
      const backendCode = readFileSync(
        resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts'),
        'utf-8',
      );
      expect(
        backendCode,
        'reaper 5min 阈值仍存在(回归 cs-round-002)',
      ).toMatch(/maxAgeMs\s*:\s*number\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    });
  });

  // ── Scenario 4: continueFromMessageId 路径不受影响 ──
  describe('Scenario 4: continueFromMessageId 路径不受影响(走 getMessage 复用 existing.id)', () => {
    it('Then continueFromMessageId 校验(status=2/4) + assistantMsgId=existing.id 仍存在', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      // continueFromMessageId status 校验路径仍存在
      expect(
        code,
        'cs-round-028 回归:continueFromMessageId 仅允许续推 status=2/4 的校验块必须仍存在',
      ).toMatch(/continueFromMessageId[\s\S]{0,400}status[\s\S]{0,100}!==\s*2[\s\S]{0,100}!==\s*4/);

      // 续推命中 in-flight Map 后 tee + writer.merge 仍存在(csr026)
      expect(
        code,
        'cs-round-028 回归:续推命中分支 inFlightGenerations.get(assistantMsgId) 仍存在',
      ).toMatch(/inFlightGenerations\.get\s*\(\s*assistantMsgId\s*\)/);
      expect(
        code,
        'cs-round-028 回归:续推命中分支 writer.merge 仍存在',
      ).toMatch(/writer\.merge\s*\(\s*[A-Za-z_$][\w$]*Stream\s*\)/);
    });
  });

  // ── Scenario 5: handoff 路径不受影响 ──
  describe('Scenario 5: handoff 路径不受影响(走 ack status=1)', () => {
    it('Then handoff ack appendMessage({role:assistant, status:1, source:system-ack}) 块必须仍存在', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      expect(
        code,
        'cs-round-028 回归:handoff ack appendMessage({role:assistant, status:1, source:system-ack}) 块必须仍存在',
      ).toMatch(/source\s*:\s*['"]system-ack['"]/);

      // handoff 路径必须**不**包含 streamText 同步构造(early return 在前)
      // 通过验证 handoff ack 后立即 early return 即可
      const ackIdx = code.search(/source\s*:\s*['"]system-ack['"]/);
      expect(ackIdx, 'handoff ack 块必须存在').toBeGreaterThanOrEqual(0);

      // handoff ack 出现在 streamText 之前(early return 路径)
      const streamTextIdx = code.search(/\bstreamText\s*\(\s*\{/);
      expect(
        ackIdx < streamTextIdx,
        'handoff ack 块必须在 streamText 同步构造之前(early return 路径)',
      ).toBe(true);
    });
  });

  // ── Scenario 6: first-chunk INSERT 失败 fallback ──
  describe('Scenario 6: first-chunk INSERT 失败 fallback(assistantMsgId 保持 -1,流继续给浏览器)', () => {
    it('Then onChunk 内 first-chunk INSERT 必须包 try/catch + console.warn,失败时 assistantMsgId 保持 -1', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      const onChunkIdx = code.search(/onChunk\s*:\s*\(/);
      expect(onChunkIdx, 'onChunk 回调必须存在').toBeGreaterThanOrEqual(0);
      const onChunkBody = extractBody(code, onChunkIdx);

      // 找 first-chunk INSERT 的 `.then(async () => { ... })` 块
      //   不能用 non-greedy regex,因为内联 `appendMessage({...})` 的 close `});`
      //   会让 non-greedy 在错位置截断。用 brace counting 抠出完整 body。
      const thenIdx = onChunkBody.indexOf('lastPatchInFlight.then');
      expect(thenIdx, 'first-chunk INSERT 必须并入 lastPatchInFlight 链').toBeGreaterThanOrEqual(0);
      // 找 `async () => {`
      const arrowIdx = onChunkBody.indexOf('async', thenIdx);
      const openBraceIdx = onChunkBody.indexOf('{', arrowIdx);
      let depth = 1;
      let i = openBraceIdx + 1;
      while (i < onChunkBody.length && depth > 0) {
        const ch = onChunkBody[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const insertBlock = onChunkBody.slice(openBraceIdx, i);

      // INSERT 块必含 try/catch
      expect(insertBlock, 'INSERT 块必含 try/catch(降级 fallback)').toMatch(/\btry\b/);
      expect(insertBlock, 'INSERT 块必含 catch 块').toMatch(/\bcatch\b/);
      expect(
        insertBlock,
        'INSERT 块 catch 内必含 console.warn(失败时降级,不抛错阻断流)',
      ).toMatch(/console\.warn/);

      // 关键 invariant:appendMessage 调用必须在 try 块内(而不是 try 块外独立 await)
      //   顺序契约:`try { ... await erp.appendMessage(...) ... } catch (e) { ... }`
      //   验证:`appendMessage` 出现位置在 `try {` 之后、`catch` 之前
      const tryIdx = insertBlock.search(/\btry\b/);
      const catchIdx = insertBlock.search(/\bcatch\b/);
      const appendIdx = insertBlock.search(/erp\.appendMessage/);
      expect(
        tryIdx >= 0 && catchIdx > tryIdx && appendIdx > tryIdx && appendIdx < catchIdx,
        'appendMessage 必须位于 try 块内(catch 才真正兜到 appendMessage 错误)',
      ).toBe(true);
    });

    it('And then flushPatch 守卫保留 — assistantMsgId<=0 时 skip PATCH', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      // 找 flushPatch 函数定义 `const flushPatch = (status: number) => {`
      // 注意:`flushPatch\s*\(` 会撞到 `flushPatch(2)` 调用点,必须用定义形态
      const flushPatchIdx = code.search(/\bflushPatch\s*=\s*\(/);
      expect(flushPatchIdx, 'flushPatch 函数定义必须存在').toBeGreaterThanOrEqual(0);
      const flushBody = extractBody(code, flushPatchIdx);

      expect(
        flushBody,
        'cs-round-028 守卫:flushPatch 必含 `assistantMsgId <= 0` 守卫(INSERT in-flight / 失败时不漏 PATCH)',
      ).toMatch(/assistantMsgId\s*<=\s*0/);
    });

    it('And then outer onError → serializeError 路径仍存在(error type chunk 可见)', () => {
      const code = readCode('ai-cs-demo/src/app/api/chat/route.ts');

      expect(
        code,
        'cs-round-028 回归:outer onError flushPatch(4) + inFlightGenerations.delete(assistantMsgId) 仍存在',
      ).toMatch(/flushPatch\s*\(\s*4\s*\)/);

      // serializeError 函数仍存在
      expect(
        code,
        'cs-round-028 回归:serializeError 函数仍存在',
      ).toMatch(/function\s+serializeError\s*\(/);
    });
  });

  // ── 回归 — 已有 spec 不被本 spec 损坏 ──
  describe('回归:已有 cs-round-xxx spec 不被本 spec 损坏', () => {
    it('Then backend cs-round-002 reaper spec 仍存在', () => {
      const specPath = resolve(ROOT, 'erp-admin-backend/test/cs-round-002.e2e-spec.ts');
      expect(existsSync(specPath), 'cs-round-002 reaper 后端 spec 应继续存在').toBe(true);
    });

    it('And then backend cs-round-011 续推 spec 仍存在', () => {
      const specPath = resolve(ROOT, 'erp-admin-backend/test/cs-round-011.e2e-spec.ts');
      expect(existsSync(specPath), 'cs-round-011 后端 spec 应继续存在').toBe(true);
    });

    it('And then ai-cs-demo cs-round-022 跳过空 user spec 仍存在(占位块断言已反转)', () => {
      const specPath = resolve(ROOT, 'ai-cs-demo/src/cs-round-022.spec.ts');
      expect(existsSync(specPath), 'cs-round-022 co-located spec 应继续存在').toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      // cs-round-028 反转已写入
      expect(
        text,
        'cs-round-022 spec 已更新 — 反向断言预占位块不存在 + 正向断言 onChunk INSERT',
      ).toMatch(/cs-round-028 反转/);
    });

    it('And then ai-cs-demo cs-round-024 tee+bgdrain spec 仍存在', () => {
      const specPath = resolve(ROOT, 'ai-cs-demo/src/cs-round-024.spec.ts');
      expect(existsSync(specPath), 'cs-round-024 co-located spec 应继续存在').toBe(true);
    });

    it('And then cs-round-026 in-flight Map 根 spec 仍存在', () => {
      // cs-round-026 只有根 spec(在 tests/_specs/),没有 co-located
      const root = resolve(ROOT, 'tests/_specs/cs-round-026.spec.ts');
      expect(existsSync(root), 'cs-round-026 根 spec 应继续存在').toBe(true);
    });

    it('And then ai-cs-demo cs-round-027 SSE 解析 spec 仍存在', () => {
      const specPath = resolve(ROOT, 'ai-cs-demo/src/cs-round-027.spec.ts');
      expect(existsSync(specPath), 'cs-round-027 SSE 解析 spec 应继续存在').toBe(true);
    });
  });
});