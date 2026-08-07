/**
 * @status implemented
 * @change-id cs-round-037
 * @incident-id T-20260807004
 * @incident-date 2026-08-07
 * @root-cause ai-cs 端 chat/285 有 OPEN ticket T-20260807004 但 banner 不显示。
 *              cs-round-036 RAGChat 用 useEffect 拉 getSessionOpenTicket → 刷新页面时 ticket
 *              已存在,应该 work;实测仍未显示(backend log 17:45:44 显示拉过 ticket,但 UI
 *              banner 仍缺席)。可能 HMR 没全 reload + RAGChat mount 时 backendSessionId 还没就绪
 *              的竞态场景。
 *
 *              cs-round-036 防御性不足的根因:RAGChat 完全靠"mount 时拉一次"判断 OPEN 工单。
 *              当 ticket 是后台主动创建(运营主动 escalate / 新对话触发转人工),RAGChat
 *              已挂载但 useEffect 没感知 ticket_created,导致 sessionHasOpenTicket 永远是 false。
 *
 * cs-round-037:加 WS ticket_created 事件 + ai-cs 订阅 + setSessionHasOpenTicket(true)
 *              — 后端 createEscalation 成功后 emit,ai-cs 端收到立即显示 banner(竞态修复)
 *
 * Out of scope:
 *   - 客服后台手动创建工单的 ticket_created 路径(本次只覆盖 createEscalation;
 *     ticket.service.createTicket 可在 cs-round-038 单独处理,如果存在)
 *
 * Spec 契约(代码契约 grep,跨包 3 文件):
 *
 *   A. erp-admin-backend internal.service.createEscalation 成功后必须 emit
 *      'ticket_created' 到 room `session:${sessionId}`,payload 含
 *      {ticketId, ticketNo, status, priority, closedBy?}
 *   B. ai-cs-demo realtime-client.ts 必须新增 TicketCreatedPayload 类型 + onTicketCreated
 *      订阅 API
 *   C. ai-cs-demo RAGChat.tsx 必须订阅 onTicketCreated,收到后 setSessionHasOpenTicket(true)
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// 过滤单行 // 注释和块注释行
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

describe('cs-round-037: WS ticket_created 事件 + ai-cs 订阅', () => {
  // ── 契约 A:后端 createEscalation emit ticket_created ──
  describe('A. Given: erp-admin-backend internal.service.ts createEscalation', () => {
    it('Then: 必须在 ticket 创建成功后 emit "ticket_created" WS 事件', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // emit 'ticket_created' 必须在 createEscalation 方法体内(而不是其他无关方法)
      // 简化:整个文件 grep emit('ticket_created')
      expect(
        text,
        'createEscalation 必须 emit "ticket_created" 事件(ai-cs 端订阅后立即显示 banner)',
      ).toMatch(/realtime\.server[\s\S]{0,200}\.emit\s*\(\s*['"`]ticket_created['"`]/);

      // emit 必须发到 session room(让 ai-cs 端对应 sessionKey 的客户端能收到)
      expect(
        text,
        'emit 必须发到 room session:${sessionId}',
      ).toMatch(/realtime\.server[\s\S]{0,500}session:\$\{[\s\S]*?emit\s*\(\s*['"`]ticket_created['"`]/);

      // payload 必须含 ticketId + ticketNo
      const emitMatch = text.match(
        /realtime\.server[\s\S]{0,200}\.emit\s*\(\s*['"`]ticket_created['"`]\s*,\s*\{([\s\S]*?)\}\s*\)/,
      );
      expect(
        emitMatch?.[1] ?? '',
        'emit payload 必须含 ticketId / ticketNo(ai-cs 端显示用)',
      ).toBeTruthy();
      const payload = emitMatch![1];
      expect(payload, 'payload 必须含 ticketId').toMatch(/ticketId/);
      expect(payload, 'payload 必须含 ticketNo').toMatch(/ticketNo/);
    });
  });

  // ── 契约 B:ai-cs realtime-client.ts 新增 TicketCreatedPayload + onTicketCreated ──
  describe('B. Given: ai-cs-demo realtime-client.ts', () => {
    it('Then: 必须新增 TicketCreatedPayload 类型 + onTicketCreated 订阅 API', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/lib/realtime-client.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // TicketCreatedPayload 类型
      expect(
        text,
        'realtime-client 必须导出 TicketCreatedPayload 类型',
      ).toMatch(/export\s+interface\s+TicketCreatedPayload/);

      // onTicketCreated 订阅 API
      expect(
        text,
        'realtime-client 必须导出 onTicketCreated 函数',
      ).toMatch(/export\s+function\s+onTicketCreated/);

      // socket 必须订阅 ticket_created 事件并分发给 handlers
      expect(
        text,
        'connectRealtime 内部 socket 必须监听 ticket_created 事件',
      ).toMatch(/socket\.on\s*\(\s*['"`]ticket_created['"`]/);
    });
  });

  // ── 契约 C:RAGChat 订阅 onTicketCreated → setSessionHasOpenTicket(true) ──
  describe('C. Given: ai-cs-demo RAGChat.tsx', () => {
    it('Then: 必须订阅 onTicketCreated,收到后 setSessionHasOpenTicket(true)', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/lib/components/RAGChat.tsx',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // import onTicketCreated
      expect(
        text,
        'RAGChat 必须 import onTicketCreated',
      ).toMatch(/import\s*\{[^}]*onTicketCreated[^}]*\}\s*from\s*['"`][^'"']*realtime-client['"`]/);

      // useEffect 订阅
      expect(
        text,
        'RAGChat 必须用 useEffect 调 onTicketCreated(handler) 订阅',
      ).toMatch(/onTicketCreated\s*\(/);

      // handler 必须 setSessionHasOpenTicket(true)
      expect(
        text,
        'onTicketCreated handler 必须 setSessionHasOpenTicket(true)(cs-round-036 banner 显示条件)',
      ).toMatch(/onTicketCreated[\s\S]{0,300}setSessionHasOpenTicket\s*\(\s*true\s*\)/);
    });
  });
});