/**
 * @status draft
 * @change-id cs-round-031
 * // @cross-package: ai-cs
 *
 * cs-round-031:客服已接手后,user 后续消息不再合成重复"运营正在处理,请稍候" ack
 *
 * Why:
 *   T-20260807002 工单场景下,客户先转人工 → 客服回复"好的" → 客户再问"处理好了吗"
 *   → 系统又合成一条新的"运营正在处理,请稍候"。这违反 UX 预期:
 *   客服已接手,客户再发消息不该再弹"请稍候"提示(暗示还没人接)。
 *
 *   根因:`ai-cs-demo/src/app/api/chat/route.ts:344-400` 的 ack 逻辑只查 `openTicket`,
 *   不查 session 是否已有 `metadata.source='operator'` 的 cs_message;只要工单仍
 *   OPEN,user 每条消息都合成 ack。
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. `erp-admin-client.ts` 必须新增 `hasOperatorReply(sessionId): Promise<boolean>`
 *      方法,用于查询该 session 是否已有 operator 回复(metadata.source='operator')。
 *
 *   B. `chat/route.ts` ack 块(进入 openTicket 分支后)必须调用 `hasOperatorReply`,
 *      根据结果走 if/else 分支 — 不是无条件合成 ack。
 *
 *   C. 当 hasOperatorReply=true 时,chat/route.ts 不能合成 "运营正在处理" ackText
 *      进 stream(也不能 appendMessage(role='assistant', content 含该 ackText)。
 *
 *   D. 当 hasOperatorReply=true 时,前端 useChat 必须收到合法 SSE 流(可以是空流
 *      仅 finish 事件)让 user message 状态从 submitted → ready,不能直接 500 /
 *      hang 住。
 *
 *   E. ack 块**之前**的 `appendMessage(user)` 调用必须保留(让 ERP 端 user_message
 *      WS emit 仍正常发出,运营继续看到客户问题)。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释(同 cs-round-026 / 028 / 029)
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

/** 抠出 ack 块(openTicket 分支内,直到对应的 `} catch` 或 `}`) */
function extractAckBlock(text: string): string {
  // 找 openTicket 起点
  const m = text.match(/if\s*\(\s*openTicket\b/);
  if (!m || m.index === undefined) return '';
  const startIdx = m.index;
  // brace counter 抠到匹配的 `}`
  let depth = 0;
  let started = false;
  let i = startIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
      started = true;
    } else if (ch === '}') {
      depth--;
      if (started && depth === 0) break;
    }
    i++;
  }
  return text.slice(startIdx, i + 1);
}

describe('cs-round-031: 客服已接手后 user 消息不再合成重复 ack',() => {
  // ── 契约 A:erp-admin-client 必须有 hasOperatorReply 方法 ──
  describe('Given: ai-cs-demo/src/lib/erp-admin-client.ts', () => {
    it('Then: 必须声明 hasOperatorReply(sessionId): Promise<boolean> 方法', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 hasOperatorReply 方法签名
      const decl = text.match(
        /\basync\s+hasOperatorReply\s*\(\s*sessionId\s*:\s*number\s*\)\s*:\s*Promise\s*<\s*boolean\s*>/,
      );
      expect(
        decl?.[0] ?? '',
        'erp-admin-client 必须声明 hasOperatorReply(sessionId: number): Promise<boolean>',
      ).toBeTruthy();

      // 方法体内必须有 metadata.source === 'operator'(或等价)的判断
      // 注:`(?::[^{]*)?` 是为了容忍上一条断言强制要求的返回类型标注
      // (`): Promise<boolean> {`)—— 否则两条断言互斥,合法 TS 写不出来
      const methodMatch = text.match(
        /async\s+hasOperatorReply\s*\([^)]*\)\s*(?::[^{]*)?\{([\s\S]*?)\n\s*\}/,
      );
      expect(methodMatch?.[1] ?? '', 'hasOperatorReply 方法体必须存在').toBeTruthy();
      expect(
        methodMatch?.[1] ?? '',
        'hasOperatorReply 方法体必须查 metadata.source === \'operator\'(或等价字符串)',
      ).toMatch(/source\s*===?\s*['"`]operator['"`]|source\s*:\s*['"`]operator['"`]/);
    });
  });

  // ── 契约 B + C:chat/route.ts ack 块必须调用 hasOperatorReply 并分支 ──
  describe('Given: ai-cs-demo/src/app/api/chat/route.ts ack 块(openTicket 分支内)', () => {
    const ROUTE = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');

    it('Then: ack 块内必须调用 erp.hasOperatorReply(sessionId)', () => {
      expect(existsSync(ROUTE)).toBe(true);
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));

      const ackBlock = extractAckBlock(text);
      expect(ackBlock, '必须能找到 ack 块(openTicket 分支内)').not.toBe('');

      // ack 块必须包含 hasOperatorReply 调用
      const call = ackBlock.match(
        /\b(?:erp|this\.erp)\.hasOperatorReply\s*\(\s*sessionId\s*\)/,
      );
      expect(
        call?.[0] ?? '',
        'ack 块内必须调 erp.hasOperatorReply(sessionId) 决定 ack 行为',
      ).toBeTruthy();
    });

    it('Then: ack 块必须根据 hasOperatorReply 结果走 if/else 分支(不是无条件合成 ackText)', () => {
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));
      const ackBlock = extractAckBlock(text);
      expect(ackBlock).not.toBe('');

      // 必须有 hasOperatorReply 之后的 if 分支(hasOperatorReply 解构或直接当条件)
      const hasBranch = ackBlock.match(
        /\bif\s*\(\s*(?:const\s+)?(?:hasOperatorReply|replyFromOperator)\b/,
      );
      expect(
        hasBranch?.[0] ?? '',
        'ack 块必须有 if (hasOperatorReply) 或 if (const { hasOperatorReply } = ...) 分支',
      ).toBeTruthy();
    });

    it('Then: 当 hasOperatorReply=true 分支不能合成 "运营正在处理" ackText 进 stream', () => {
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));
      const ackBlock = extractAckBlock(text);
      expect(ackBlock).not.toBe('');

      // 抠出 if (hasOperatorReply) 的 truthy 分支(到匹配的 `}`)
      const hasBranchMatch = ackBlock.match(
        /\bif\s*\(\s*(?:const\s+)?(?:hasOperatorReply|replyFromOperator)\b[^)]*\)\s*\{/,
      );
      expect(hasBranchMatch?.[0] ?? '', 'hasOperatorReply 分支必须存在').toBeTruthy();
      const branchStart = ackBlock.indexOf(hasBranchMatch![0]);
      let depth = 0;
      let started = false;
      let i = branchStart;
      while (i < ackBlock.length) {
        const ch = ackBlock[i];
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          depth--;
          if (started && depth === 0) break;
        }
        i++;
      }
      const hasBranchBody = ackBlock.slice(branchStart, i + 1);

      // hasOperatorReply=true 时不能含 ackText 字符串
      expect(
        hasBranchBody,
        'hasOperatorReply=true 分支不能含 "运营正在处理" 文案(避免重复 ack)',
      ).not.toMatch(/运营正在处理|请稍候/);

      // 但必须有 createUIMessageStreamResponse / writer.write({type:'finish'}) 之类
      // 让前端 useChat 收到合法流(契约 D)
      const hasStreamReturn =
        /createUIMessageStreamResponse\s*\(/.test(hasBranchBody) ||
        /createUIMessageStream\s*\(/.test(hasBranchBody);
      expect(
        hasStreamReturn,
        'hasOperatorReply=true 分支必须返合法 SSE 流(createUIMessageStreamResponse / createUIMessageStream)',
      ).toBe(true);
    });

    it('Then: 当 hasOperatorReply=false 分支必须仍合成 "运营正在处理" ackText(保留首次转人工 UX)', () => {
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));
      const ackBlock = extractAckBlock(text);
      expect(ackBlock).not.toBe('');

      // hasOperatorReply=false 分支应是 else(紧跟 hasOperatorReply=true 的 if)
      const elseMatch = ackBlock.match(/\}\s*else\s*\{/);
      expect(
        elseMatch?.[0] ?? '',
        '必须存在 else 分支(hasOperatorReply=false 走原 ack 路径)',
      ).toBeTruthy();
      const elseStart = ackBlock.indexOf(elseMatch![0]);
      let depth = 0;
      let started = false;
      let i = elseStart;
      while (i < ackBlock.length) {
        const ch = ackBlock[i];
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          depth--;
          if (started && depth === 0) break;
        }
        i++;
      }
      const elseBody = ackBlock.slice(elseStart, i + 1);

      expect(
        elseBody,
        'hasOperatorReply=false 分支必须含 ackText = "运营正在处理您的消息,请稍候。"',
      ).toMatch(/ackText\s*=\s*['"]运营正在处理/);
    });
  });

  // ── 契约 E:ack 块前的 appendMessage(user) 必须保留 ──
  describe('Given: chat/route.ts ack 块之前的 user appendMessage 路径', () => {
    it('Then: appendMessage(user) 调用必须在 ack 块(openTicket 块)之前,且 payload role 必须为 user', () => {
      const ROUTE = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));

      // 找 appendMessage(sessionId, { role: 'user', ... }) 块
      const userAppend = text.match(
        /\b(?:erp|this\.erp)\.appendMessage\s*\(\s*sessionId\s*,\s*\{[\s\S]*?role\s*:\s*['"`]user['"`][\s\S]*?\}\s*\)/,
      );
      expect(
        userAppend?.[0] ?? '',
        'ack 块前必须保留 appendMessage(sessionId, { role: \'user\', ... }) 调用',
      ).toBeTruthy();

      // 该 appendMessage 必须在 openTicket 块**之前**(用索引比较)
      const appendIdx = text.indexOf(userAppend![0]);
      const openTicketIdx = text.indexOf('if (openTicket');
      expect(openTicketIdx, 'openTicket 块必须存在').toBeGreaterThan(-1);
      expect(
        appendIdx < openTicketIdx,
        'appendMessage(user) 必须在 ack/openTicket 块之前(让 ERP user_message WS emit 先发出)',
      ).toBe(true);
    });
  });
});