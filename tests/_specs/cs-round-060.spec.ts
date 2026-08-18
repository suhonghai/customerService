/**
 * @status implemented
 * @change-id cs-round-060
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause prod session 86/88 cs_message 出现 status=4 + content_len=0 +
 *   chunkCount=0 + errorMessage="No output generated. Check the stream"
 *   的同时,DB 显示同 session 的 user msg 正常(status=1),ai-config modelId=
 *   qwen3.7-max 持续运行。日志显示 chat route 同 assistantMsgId 触发了**两
 *   次** `cs-round-026 in-flight registered`(line 43 + line 45)— 同一
 *   placeholder id=93 同时被两个 POST /api/chat handler 的 streamText 持有。
 *
 *   复盘:cs-round-059 引入「else 分支复用已有 status=2 assistant placeholder」
 *   (line 573-614),但**没**加 in-flight 检查。BFF upsert 创建 placeholder 后,
 *   两个并发 POST /api/chat 请求都走到 else 分支、cs-round-059 都看到 status=2、
 *   都复用 id=93、各自起 streamText、各自 register in-flightGenerations[93]—
 *   后注册的覆盖前者。两个 streamText 共写同一 cs_message row,后写赢,导致
 *   AI 实际产生的 text-delta 被空 content 覆盖,最终落库 status=4 +
 *   chunkCount=0。
 *
 * cs-round-060 修法:
 *   A. else 分支在 cs-round-059 复用 placeholder 后,先检查
 *      `inFlightGenerations.has(placeholderId)`。有则转发原 uiStream(走与续推
 *      路径相同的 tee + drainForever + writer.merge 链路),**不**起新 streamText。
 *      没有则照原路径起新 streamText。
 *   v2(prod session 92 复现 v1 失败):v1 检查点太晚 — inFlight 注册要等
 *      result.toUIMessageStream().tee() 之后(原 line ~1183),耗时数百 ms;
 *      两并发 POST 都过完 v1 check(inFlight undefined)→ 都建 streamText。
 *      v2 修法:「决定用 assistantMsgId 那一刻(续推 / else 两个分支)立即注册
 *      tentative inFlightGenerations entry(stream:null + finished 等 streamReady
 *      Promise),转发块看到 stream=null 时 await streamReadyByMsg,等 buildStream
 *      完成 + 真实 stream 替换后再转发」,串行彻底堵死 race window。
 *   B. chat/route.ts flushPatch 走模块级 per-assistantMsgId 串行链
 *      (Map<id, Promise<void>>)— 即使未来某条路径仍出现两个 PATCH 写同一行,
 *      第二个 PATCH 等第一个 resolve 才发,避免「A 写 status=1+content 完成前
 *      B 写 status=4+空 content」的乱序写入。
 *
 *   Out of scope:
 *   - 续推路径(continueFromMessageId)的并发安全(line 533 已 check in-flight,
 *     本 spec 不重复检)
 *   - 跨进程分布式锁(单实例跑够用)
 *   - UX 兜底(InterruptBanner 联动)— 用户决定 cs-round-060 只修后端
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

describe('cs-round-060: chat route 同 assistantMsgId 并发 streamText 竞态', () => {
  describe('A. else 分支 in-flight 转发(避免重复起 streamText)', () => {
    it('Then: cs-round-059 reuse placeholder 后必须检查 inFlightGenerations 并转发', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.1:else 分支 cs-round-059 reuse placeholder 之后必须有 in-flight 检查
      // 顺序硬要求:find status=2 → reuse placeholderId → check in-flight → forward 或 create
      // 检查用 .get(placeholderId)(既检查存在又拿到 entry,比 .has(...) 更 idiom)— 没有
      // 这种 get 就证明 fix A 没装。
      expect(
        text,
        'chat/route.ts 必须有 inFlightGenerations.get(placeholderId) 检查(防并发 streamText)',
      ).toMatch(/inFlightGenerations\.get\s*\(\s*placeholderId\s*\)/);

      // 契约 A.2:转发逻辑必须走与续推路径相同的「tee + drainForever + writer.merge」三件套
      expect(
        text,
        'forwarding 必须 tee in-flight stream → drainForever bg 分支 → merge client',
      ).toMatch(/inFlight\.stream\.tee\s*\(/);
      expect(
        text,
        'forwarding bg 分支必须 drainForever(续命 source streamText)',
      ).toMatch(/drainForever\s*\(\s*resumeBgStream\s*\)/);

      // 契约 A.3:cs-round-059 reuse placeholder 逻辑必须保留(原 console.log + 后续 erp.appendMessage)
      expect(
        text,
        'cs-round-059 reuse existing assistant placeholder console.log 必须保留',
      ).toMatch(/cs-round-059 reuse existing assistant placeholder/);
      expect(
        text,
        'cs-round-059 fallback create new placeholder(erp.appendMessage role assistant status 2)必须保留',
      ).toMatch(/erp\.appendMessage\s*\(\s*sessionId[\s\S]*?role\s*:\s*['"]assistant['"][\s\S]*?status\s*:\s*2/);

      // 契约 A.4:reuse 之后(create 新 placeholder 之前)必须有 forward 块
      // 找 reuse console.log 之后到 create 新 placeholder 之间的窗口,必须有 in-flight 转发逻辑
      const reuseIdx = text.indexOf('cs-round-059 reuse existing assistant placeholder');
      const createIdx = text.indexOf('if (placeholderId === null)', reuseIdx);
      const betweenBlock = text.slice(reuseIdx, createIdx);
      expect(
        betweenBlock,
        'cs-round-059 reuse placeholder 之后、create 新 placeholder 之前必须加 in-flight 转发块',
      ).toMatch(/inFlightGenerations\.get\s*\(\s*placeholderId\s*\)/);
      expect(
        betweenBlock,
        'forward 块必须 tee in-flight.stream 后 drainForever bg 分支',
      ).toMatch(/inFlight!?\.stream\.tee\s*\(\s*\)/);
      expect(
        betweenBlock,
        'forward 块必须有 cs-round-060 v2 日志标注(说明 v2 已就位)',
      ).toMatch(/cs-round-060 v2 forward/);
    });
  });

  describe('v2. claim block + streamReady Promise (堵死 v1 的 race window)', () => {
    it('Then: chat/route.ts 必须有 streamReadyByMsg + streamReadyResolvers + claim + await 块', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // v2.1:模块级 streamReadyByMsg / streamReadyResolvers 必须存在
      expect(
        text,
        '必须声明 streamReadyByMsg Map<number, Promise<InFlightEntry>>(v2 关键)',
      ).toMatch(/streamReadyByMsg\s*=\s*new\s+Map\s*<\s*number\s*,\s*Promise\s*<\s*InFlightEntry\s*>\s*>/);
      expect(
        text,
        '必须声明 streamReadyResolvers Map<number, (entry) => void>(v2 resolver 存储)',
      ).toMatch(/streamReadyResolvers\s*=\s*new\s+Map\s*<\s*number\s*,\s*\(\s*entry\s*:\s*InFlightEntry\s*\)\s*=>\s*void\s*>/);

      // v2.2:claim 块必须存在(决定用 id 那一刻就注册 tentative inFlight)
      // 至少 2 个 claim 块:续推分支 + else 分支 cs-round-059 reuse 之后
      const claimMatches = text.match(/cs-round-060 v2 claim/g);
      expect(
        claimMatches && claimMatches.length >= 2,
        'claim 块必须至少 2 处(续推分支 + else 分支 cs-round-059 reuse 之后)',
      ).toBe(true);

      // v2.3:await stream-ready 块必须存在(转发前等真实 stream)
      const awaitMatches = text.match(/await\s+streamReadyByMsg\.get\s*\(\s*assistantMsgId\s*\)/);
      expect(
        awaitMatches && awaitMatches.length >= 1,
        'await streamReadyByMsg.get(assistantMsgId) 块必须存在(v2 串行核心)',
      ).toBe(true);

      // v2.4:buildStream 完成处必须 resolver.resolve(realEntry)(把真实 entry 投递给 waiter)
      // 找 inFlightGenerations.set(realEntry) 之后的窗口
      expect(
        text,
        'buildStream 完成处必须 resolver(realEntry) 解锁 waiter',
      ).toMatch(/streamReadyResolvers\.get\s*\(\s*assistantMsgId\s*\)/);
      expect(
        text,
        'buildStream 完成处必须 resolver 调用,不能漏',
      ).toMatch(/resolver\s*\(\s*realEntry\s*\)/);

      // v2.5:onError 必须 cleanup tentative entry,不能让 waiter 永远卡住
      expect(
        text,
        'onError 必须 resolver(null) 让 waiter 醒来 re-check',
      ).toMatch(/resolver\s*\(\s*null\s+as\s+unknown\s+as\s+InFlightEntry\s*\)/);
    });
  });

  describe('B. flushPatch 走模块级 per-assistantMsgId 串行链', () => {
    it('Then: chat/route.ts 必须有模块级 patchChainsByMsg Map,flushPatch 必须链式写入', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.1:模块级 Map<number, Promise<void>> 必须存在
      expect(
        text,
        '必须声明模块级 patchChainsByMsg Map<number, Promise<void>>(per-msg 串行链)',
      ).toMatch(/patchChainsByMsg\s*=\s*new\s+Map\s*<\s*number\s*,\s*Promise\s*<\s*void\s*>\s*>/);

      // 契约 B.2:flushPatch 必须 chain 到 patchChainsByMsg[assistantMsgId]
      // 而不是只更新 lastPatchInFlight(per-request chain,无 cross-request 串行)
      const flushPatchBody = text.match(
        /const\s+flushPatch\s*=\s*\(\s*status\s*:\s*number\s*\)\s*=>\s*\{[\s\S]*?\n\s{4}\};/,
      );
      expect(
        flushPatchBody?.[0] ?? '',
        'flushPatch 函数必须存在',
      ).toBeTruthy();
      expect(
        flushPatchBody![0],
        'flushPatch 必须读 patchChainsByMsg.get(assistantMsgId) 作为前驱链',
      ).toMatch(/patchChainsByMsg\.get\s*\(\s*assistantMsgId\s*\)/);
      expect(
        flushPatchBody![0],
        'flushPatch 必须把新 promise 写回 patchChainsByMsg.set(assistantMsgId, ...)',
      ).toMatch(/patchChainsByMsg\.set\s*\(\s*assistantMsgId\s*,/);
    });
  });
});