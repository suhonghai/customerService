/**
 * @status draft
 * @change-id cs-round-022
 *
 * cs-round-022: BFF 跳过空 user 消息落库(防 useAutoResumeStreaming 续推污染历史)
 *
 * Why(为什么做):
 * useAutoResumeStreaming.resumeOne(在 src/hooks/use-auto-resume-streaming.ts 里)
 * 续推时 POST /api/chat body 塞一条合成 user:
 *   { id: 'm_continue_<id>', role: 'user', parts: [{ type: 'text', text: '' }] }
 * 此前 BFF src/app/api/chat/route.ts:222-227 无脑 appendMessage({role:'user',
 * content:'', status:1}),DB 永久多一条空 user row(conv history 看得见,
 * UI 显示一个空 user bubble)。
 *
 * 截图证据:某会话 history 返回
 *   - id=289 role:user content:"查一下我的订单" status=1 (真用户提问 — 保留)
 *   - id=290 role:assistant content:"" status=2 (stuck placeholder — reaper 兜底)
 *   - id=291 role:user content:"" status=1 (污染源 — 本 spec 拦住)
 *
 * 修法:
 *   A. route.ts 加 isEffectivelyEmptyUserMessage(queryText, parts) pure 函数,
 *      判定 user message 是否「实质空」(parts=[] + content 空 / parts 全空 text
 *      + content 空或 whitespace-only → true;有 tool-call / 真文本 → false)。
 *   B. appendMessage 之前判一下:空就只 console.warn 不入库,streamText 上下文不动。
 *
 * 关键 invariant:
 *   - body.messages / lastUserMessage / streamText 上下文 **不动** — streamText
 *     仍能从 body.messages 拿到那条合成 user,正常开始生成 assistant 流。
 *   - 仅入库动作跳过。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — chat/route.ts appendMessage 前必含空 user 守卫
 *     Given ai-cs-demo/src/app/api/chat/route.ts 源码
 *     Then  在 `appendMessage({role:'user'...})` 调用之前必须出现守卫函数调用
 *           (允许函数名变体:isEffectivelyEmptyUserMessage / shouldSkipUserAppend /
 *           userMessageIsEmpty 都过)
 *     And   函数体必含 isEffectivelyEmptyUserMessage / 类似纯函数的实现
 *
 *   Scenario 2: 守卫函数实现正确(6 条 case)
 *     Given isEffectivelyEmptyUserMessage(queryText, parts)
 *     Then  ('', []) → true
 *     And   ('', [{type:'text'}]) → true (空 text)
 *     And   ('  ', []) → true (whitespace only)
 *     And   ('hello', []) → false
 *     And   ('', [{type:'tool-call', ...}]) → false (只有 tool 调用,不算空)
 *     And   ('hi', [{type:'tool-call'}]) → false
 *
 *   Scenario 3: 不要影响其他 rewrite(回归)
 *     Given chat/route.ts 函数体
 *     Then  `appendMessage({role:'user'...})` 调用附近必须还有 status=1 守卫
 *           或 BFF 报错路径保持原样(400 / 500 / etc.)
 *     And   助手 placeholder 创建(status=2 streaming)块保持原样
 *     And   continueFromMessageId 校验路径(status=2/4)保持原样
 *     And   handoff ack 路径(appendMessage status=1 source:system-ack)保持原样
 *
 * Out of scope:
 *   - useAutoResumeStreaming.ts(发空 user 是设计选择)
 *   - refetch-history.ts(只做转换)
 *   - erp-admin-backend NestJS internal.service.ts
 *   - cs_message schema
 *   - placeholder stuck status=2(留给 reaper,本 spec 不动)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-022.spec.ts,验证守卫源码契约 + 函数行为。
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

describe('cs-round-022: BFF 跳过空 user 消息落库(防 useAutoResumeStreaming 续推污染历史)', () => {
  // ── Scenario 1: 源码契约 — chat/route.ts appendMessage 前必含空 user 守卫 ──
  describe('Scenario 1: chat/route.ts appendMessage 前必含空 user 守卫', () => {
    it('Then 函数体必含 isEffectivelyEmptyUserMessage / 类似守卫函数实现', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // 守卫函数必须存在(允许函数名变体:isEffectivelyEmptyUserMessage /
      // shouldSkipUserAppend / userMessageIsEmpty 都过)
      expect(
        code,
        'route.ts 必含 isEffectivelyEmptyUserMessage 守卫函数声明',
      ).toMatch(/function\s+(?:isEffectivelyEmptyUserMessage|shouldSkipUserAppend|userMessageIsEmpty)\s*\(/);

      // 在 appendMessage({role:'user'...}) 调用之前,必须出现守卫调用
      const userAppendIdx = code.search(/appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,200}role:\s*['"]user['"]/);
      expect(userAppendIdx, 'appendMessage({role:user,...}) 调用必须存在').toBeGreaterThanOrEqual(0);

      const beforeUserAppend = code.slice(0, userAppendIdx);
      expect(
        beforeUserAppend,
        'appendMessage({role:user,...}) 之前必含守卫函数调用',
      ).toMatch(/(?:isEffectivelyEmptyUserMessage|shouldSkipUserAppend|userMessageIsEmpty)\s*\(/);
    });
  });

  // ── Scenario 2: 守卫函数实现正确(6 条 case) ──
  describe('Scenario 2: 守卫函数实现正确', () => {
    it('Then 守卫函数实现必须满足 6 条 case 的逻辑契约(源码静态校验)', () => {
      // route.ts 顶层 'use client' + 大量 next/ai 依赖,vitest 直接 import 会拉副作用。
      // 改用 brace-counting 把守卫函数体抠出来,然后对源码做「行为契约」静态校验。
      const code = readCode('src/app/api/chat/route.ts');
      const headerRe = /export\s+function\s+(isEffectivelyEmptyUserMessage|shouldSkipUserAppend|userMessageIsEmpty)\s*\(/;
      const headerMatch = code.match(headerRe);
      expect(headerMatch, '守卫函数头必须存在').not.toBeNull();
      const fnStart = headerMatch!.index! + headerMatch![0].length;
      // skip 到参数右括号
      let i = fnStart;
      while (i < code.length && code[i] !== ')') i++;
      // skip 到第一个 {
      while (i < code.length && code[i] !== '{') i++;
      expect(i < code.length, '守卫函数体开括号必须存在').toBe(true);
      // brace-count 找配对闭括号
      let depth = 1;
      const bodyStart = i + 1;
      i += 1;
      while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const bodyEnd = i - 1;
      const body = code.slice(bodyStart, bodyEnd);

      // 行为契约(从 brief 的 6 条 case 反推源码必含的关键字面量 / 表达式)
      // 1. ('', []) → true:必须含 parts.length === 0 && queryText.length === 0 的分支返回 true
      expect(
        body,
        "Case ('', []) → true: 函数体必含 `parts.length === 0 && queryText.length === 0` → true 分支",
      ).toMatch(/parts\.length\s*===\s*0[\s\S]{0,80}queryText\.length\s*===\s*0[\s\S]{0,40}return\s+true/);

      // 2. ('', [{type:'text'}]) → true:函数体必含 parts.every(type==='text' && text.length===0)
      expect(
        body,
        "Case ('', [{type:'text'}]) → true: 函数体必含 `parts.every(...type === 'text' && text length === 0...)` 判定",
      ).toMatch(/\.every\s*\(/);
      expect(body, "every 内必含 `type === 'text'` 判定").toMatch(/type\s*===\s*['"]text['"]/);
      expect(
        body,
        'every 内必含 text length === 0 / non-string 判定',
      ).toMatch(/text.*length\s*===\s*0|text.*!==\s*['"]string['"]/);

      // 3. ('  ', []) → true:queryText 判定必须用 trim().length === 0(否则 whitespace-only 漏判)
      expect(
        body,
        "Case ('  ', []) → true: 函数体必含 `queryText.trim().length === 0` 判定",
      ).toMatch(/queryText\.trim\(\)\.length\s*===\s*0/);

      // 4. ('hello', []) → false:对非空 queryText 必不返回 true
      expect(
        body,
        "Case ('hello', []) → false: queryText.trim().length === 0 是返回 true 的前置条件",
      ).toMatch(/queryText\.trim\(\)\.length\s*===\s*0/);

      // 5. ('', [{type:'tool-call', ...}]) → false:tool-call 必被视为「非空」
      // every 必 type === 'text' 才算空;tool-call 必被排除(只在 type==='text' 时纳入判定)
      expect(
        body,
        "Case ('', [{type:'tool-call',...}]) → false: every 内必用 `type === 'text'` 限定,tool-call 不算空 text",
      ).toMatch(/\.every\s*\([\s\S]{0,200}type\s*===\s*['"]text['"]/);

      // 6. ('hi', [{type:'tool-call'}]) → false:有非空 queryText 时必不返回 true
      // 已经由 case 3 的 trim 判定保证
      expect(
        body,
        "Case ('hi', [{type:'tool-call'}]) → false: 非空 queryText 不满足 trim().length === 0 条件",
      ).toMatch(/queryText\.trim\(\)\.length\s*===\s*0/);
    });
  });

  // ── Scenario 3: 不要影响其他 rewrite ──
  describe('Scenario 3: 不要影响其他 rewrite(回归)', () => {
    it('Then appendMessage({role:user,...}) 附近必带 status=1 + BFF 报错路径保持原样', () => {
      const code = readCode('src/app/api/chat/route.ts');

      // appendMessage({role:'user', ...status:1}) 仍存在
      expect(
        code,
        'appendMessage({role:user,...status:1}) 调用块必须仍存在',
      ).toMatch(/appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,200}role:\s*['"]user['"][\s\S]{0,400}status:\s*1/);

      // 助手 placeholder 创建(status=2)块保持原样
      expect(
        code,
        '助手 placeholder appendMessage({role:assistant,status:2}) 必须仍存在',
      ).toMatch(/appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]{0,200}role:\s*['"]assistant['"][\s\S]{0,400}status:\s*2/);

      // continueFromMessageId 校验路径(status=2/4)保持原样
      expect(
        code,
        'continueFromMessageId 仅允许续推 status=2/4 的校验块必须仍存在',
      ).toMatch(/continueFromMessageId[\s\S]{0,400}status[\s\S]{0,100}!==\s*2[\s\S]{0,100}!==\s*4/);

      // handoff ack 路径 appendMessage status=1 source:system-ack 保持原样
      expect(
        code,
        'handoff ack appendMessage({role:assistant,status:1,source:system-ack}) 块必须仍存在',
      ).toMatch(/source:\s*['"]system-ack['"]/);

      // BFF 400 报错路径(payload 校验)仍存在
      expect(
        code,
        'BFF 400 报错路径(payload must include message/messages)必须仍存在',
      ).toMatch(/payload must include/);

      // BFF 500 报错路径(request error)仍存在
      expect(
        code,
        'BFF 500 报错路径(request error)必须仍存在',
      ).toMatch(/request error/);
    });
  });
});
