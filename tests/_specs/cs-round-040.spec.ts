/**
 * @status implemented
 * @change-id cs-round-040
 * @incident-id T-20260807004 / T-20260807005
 * @incident-date 2026-08-10
 * @root-cause ai-cs chat/route.ts 每次 user message in handoff 都 INSERT 一条
 *              source:'system-ack' 的 cs_message row(内容:'运营正在处理您的消息,请稍候。')。
 *              用户在 ticket OPEN 期间反复发消息,cs_message 表被 system-ack 灌满,
 *              客服 ConversationPanel 看到一堆重复 ack,真实对话被淹没。
 *
 *              cs-round-031 修过"客服已回过不合成 ack",但 INSERT 那条仍每次新建。
 *
 * cs-round-040:ack dedupe — 同一 session 已有 source='system-ack' row 时,
 *              不再 INSERT,改 UPDATE 那条(metdata.ticketNo + @updatedAt 自动刷),
 *              复用同一 ackMessageId = `srv-${id}`,前端 useChat 不重复创建气泡。
 *
 *              跨 ticket(关单后新开)→ 旧 ack row 不复用,新 INSERT(metadata.ticketNo 更新)。
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. ai-cs-demo chat/route.ts ack 块必须先调用 erp.getSessionMessages(sessionId)
 *      查 source='system-ack' 已有 row,有则用 updateMessage 复用、无则 appendMessage
 *   B. backend CsMessage schema @updatedAt 已存在(由 Prisma 自动维护,无需改 schema)
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

describe('cs-round-040: ack row dedupe(同 session 已有 source="system-ack" 则 UPDATE 而非 INSERT)', () => {
  // ── 契约 A:chat/route.ts ack 块必须查复用 ──
  describe('A. Given: ai-cs-demo chat/route.ts ack 块', () => {
    it('Then: ack 块必须先调 getSessionMessages 查 source="system-ack" 已有 row,有则 updateMessage,无则 appendMessage', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // ack 块(handoff 分支内 in-human-handoff 区域)
      const ackBlock = text.match(
        /in-human-handoff[\s\S]{0,5000}?return\s+createUIMessageStreamResponse/,
      );
      expect(
        ackBlock?.[0] ?? '',
        '必须存在 ack 块(in-human-handoff ... return createUIMessageStreamResponse)',
      ).toBeTruthy();
      const body = ackBlock![0];

      // 必须先查现有 ack(getSessionMessages 过滤 source='system-ack')
      expect(
        body,
        'ack 块必须先调 getSessionMessages 查现有 ack row(避免每次 INSERT 重复)',
      ).toMatch(/getSessionMessages\s*\(\s*sessionId\s*\)/);

      // 必须过滤 source='system-ack' 的 row
      expect(
        body,
        '必须过滤 source="system-ack" 的 row(找该 session 最近的 ack)',
      ).toMatch(/source\s*===?\s*['"]system-ack['"]|system-ack/);

      // 必须有 updateMessage 调用(update 复用,而不是再 appendMessage)
      expect(
        body,
        '有 ack 时必须 updateMessage 复用(而非再 appendMessage)',
      ).toMatch(/updateMessage\s*\(\s*sessionId/);

      // appendMessage 仍保留(无 ack 时新建)
      expect(
        body,
        'appendMessage 仍保留(无 ack 时新建,fallback 路径)',
      ).toMatch(/appendMessage\s*\(\s*sessionId/);
    });
  });

  // ── 契约 B:Prisma schema @updatedAt 自动维护 ──
  describe('B. Given: erp-admin-backend Prisma schema CsMessage', () => {
    it('Then: updatedAt 字段有 @updatedAt 装饰(update 自动刷新)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/prisma/schema.prisma');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // CsMessage 模型必须有 updatedAt 字段 + @updatedAt
      expect(
        text,
        'CsMessage 模型必须有 updatedAt DateTime @updatedAt(确保 update 自动刷新时间戳)',
      ).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    });
  });
});