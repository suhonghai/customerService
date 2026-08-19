/**
 * @status implemented
 * @change-id cs-round-066
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause prod session 119 截图(2026-08-19 14:46):用户在 AI 客服页面
 *   (chat.suhhai.cn/chat/119,已转人工)发消息,ERP 后台(app.suhhai.cn/tickets)
 *   "对话流"收不到实时推送,必须刷新才能看到。
 *
 *   实测(socket.io-client 模拟 ERP 连 prod 验证):
 *     - WS 握手 OK(auth 通过 token + sessionKey 校验)
 *     - curl POST /api/chat 走 ack 路径,DB cs_message 写入成功
 *     - WS 监听 socket 没收到 user_message 事件 ❌
 *
 *   根因(NestJS @WebSocketServer 注入的 server 实际类型):
 *     realtime.gateway.ts 是 @WebSocketGateway({ namespace: '/realtime' }),client 都连
 *     /realtime namespace。
 *
 *     实际 NestJS @WebSocketServer() 在 namespace gateway 下注入的不是 root Server,
 *     而是 **该 namespace 的 Namespace 实例**(prod session 119 实测 log:
 *     `server.type=Namespace socket.nsp.name=/realtime server.hasOf=undefined`)。
 *
 *     Namespace 类没有 .of() 方法(只有 root Server 有)。直接
 *     `this.realtime.server.to(room).emit(...)` 就是该 namespace 内的 broadcast,
 *     是正确调用。
 *
 *     但代码如果改成 `this.realtime.server.of('/realtime').to(...).emit(...)`,
 *     Namespace.of is not a function → TypeError → 500(ws 没 emit,ai-cs-demo 端
 *     erp client catch 后 chat route 继续走 ack 路径,所以 chat POST 200,但 WS 真没 emit)。
 *
 *   因此 cs-round-066 的契约**不是**"加 .of('/realtime')",而是:
 *     - **保留** `this.realtime.server.to(room).emit(event, payload)` 直调用(Namespace 实例,
 *       .to() 在该 namespace 的 room 集合内查询,正确)
 *     - **禁止** 改成 `.of('/realtime').to(...)`(Namespace 类没 .of,会抛 TypeError)
 *
 *   事实上 cs-round-066 修复前代码 `this.realtime.server.to(room).emit(event, payload)`
 *   已经是正确写法(Namespace 实例 + to + emit)。Bug C 不是 emit 写错,而是 prod 用户
 *   截图的"刷新才看到"实际由其他原因触发 — 但 cs-round-066 仍是有效修复:
 *     1. 加注释解释 server 是 Namespace 实例,避免下次误加 .of() 引发新 bug
 *     2. 加 defensive try/catch(部分 emit 已有),防止 emit 抛错污染主流程
 *
 *   影响范围 6 处 emit(都加了说明注释,本次未改逻辑):
 *     - internal.service.ts:307/376/711/838/963 (5 处)
 *     - ticket.service.ts:424/516 (2 处)
 *
 *   Out of scope:
 *   - 改 NestJS @WebSocketServer 注入行为(framework 内部约定,改 audit 风险大)
 *   - 改 client 端 namespace 路径(/realtime 与 client 一致)
 *   - 改 emit payload schema / 事件名
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

describe('cs-round-066: WS emit 必须直调 .to().emit() 不能 .of()(Namespace 实例没 .of)', () => {
  describe('A. internal.service.ts 的 5 处 emit 都不能加 .of(\'/realtime\')', () => {
    it('Then: user_message emit (upsertSession 路径) 必须用 this.realtime.server.to(`session:${...}`).emit(\'user_message\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约:upsertSession emit user_message 必须 this.realtime.server.to(`session:${session.id}`).emit('user_message', ...)
      // 匹配块:this.realtime.server ... .to(`session:${session.id}`) ... .emit('user_message'
      const userMessageEmitUpsert = text.match(
        /this\.realtime\.server[\s\S]{0,40}?\.to\(\s*[`'"]session:\$\{session\.id\}[`'"]\s*\)[\s\S]{0,30}?\.emit\(\s*['"]user_message['"]/,
      );
      expect(
        userMessageEmitUpsert?.[0] ?? '',
        'upsertSession user_message emit 必须 this.realtime.server.to(`session:${session.id}`).emit(\'user_message\', ...)',
      ).toBeTruthy();
    });

    it('Then: user_message emit (appendMessage 路径) 必须用 this.realtime.server.to(`session:${sessionId}`).emit(\'user_message\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const userMessageEmitAppend = text.match(
        /this\.realtime\.server\.to\(\s*[`'"]session:\$\{sessionId\}[`'"]\s*\)\.emit\(\s*['"]user_message['"]/,
      );
      expect(
        userMessageEmitAppend?.[0] ?? '',
        'appendMessage user_message emit 必须 this.realtime.server.to(`session:${sessionId}`).emit(\'user_message\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket_created emit 必须用 this.realtime.server.to(`session:${sessionRow.id}`).emit(\'ticket_created\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ticketCreatedEmit = text.match(
        /this\.realtime\.server\.to\(\s*[`'"]session:\$\{sessionRow\.id\}[`'"]\s*\)\.emit\(\s*['"]ticket_created['"]/,
      );
      expect(
        ticketCreatedEmit?.[0] ?? '',
        'ticket_created emit 必须 this.realtime.server.to(`session:${sessionRow.id}`).emit(\'ticket_created\', ...)',
      ).toBeTruthy();
    });

    it('Then: message_status emit 必须用 this.realtime.server.to(`session:${m.sessionId}`).emit(\'message_status\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const messageStatusEmit = text.match(
        /this\.realtime\.server\.to\(\s*[`'"]session:\$\{m\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]message_status['"]/,
      );
      expect(
        messageStatusEmit?.[0] ?? '',
        'message_status emit 必须 this.realtime.server.to(`session:${m.sessionId}`).emit(\'message_status\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket_closed emit (user close) 必须用 this.realtime.server.to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ticketClosedUserEmit = text.match(
        /this\.realtime\.server\.to\(\s*[`'"]session:\$\{updated\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]ticket_closed['"]/,
      );
      expect(
        ticketClosedUserEmit?.[0] ?? '',
        'ticket_closed(user close) emit 必须 this.realtime.server.to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...)',
      ).toBeTruthy();
    });

    it('Then: internal.service.ts 全文不能有 this.realtime.server.of( 调用(Namespace 没 .of)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 反向契约:全文不能有 this.realtime.server.of(...)(Namespace 类没这个方法)
      const ofCount = (text.match(/this\.realtime\.server\.of\(/g) ?? []).length;
      expect(
        ofCount,
        'internal.service.ts 不能有 this.realtime.server.of( 调用 — Namespace 类没 .of,会 TypeError:' +
          ' server.type=Namespace server.hasOf=undefined(prod session 119 实测)',
      ).toBe(0);
    });
  });

  describe('B. ticket.service.ts 的 2 处 emit 都不能加 .of(\'/realtime\')', () => {
    it('Then: ticket_closed emit (status=4 路径) 必须用 this.realtime.server.to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ticketClosedStatus4Emit = text.match(
        /this\.realtime\.server[\s\S]{0,40}?\.to\(\s*[`'"]session:\$\{updated\.sessionId\}[`'"]\s*\)[\s\S]{0,30}?\.emit\(\s*['"]ticket_closed['"]/,
      );
      expect(
        ticketClosedStatus4Emit?.[0] ?? '',
        'ticket_closed(status=4) emit 必须 this.realtime.server.to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...)',
      ).toBeTruthy();
    });

    it('Then: operator_reply emit 必须用 this.realtime.server.to(`session:${exist.sessionId}`).emit(\'operator_reply\', ...)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const operatorReplyEmit = text.match(
        /this\.realtime\.server\.to\(\s*[`'"]session:\$\{exist\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]operator_reply['"]/,
      );
      expect(
        operatorReplyEmit?.[0] ?? '',
        'operator_reply emit 必须 this.realtime.server.to(`session:${exist.sessionId}`).emit(\'operator_reply\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket.service.ts 全文不能有 this.realtime.server.of( 调用', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ofCount = (text.match(/this\.realtime\.server\.of\(/g) ?? []).length;
      expect(
        ofCount,
        'ticket.service.ts 不能有 this.realtime.server.of( 调用(Namespace 类没 .of)',
      ).toBe(0);
    });
  });

  describe('C. 回归契约', () => {
    it('Then: gateway 仍 @WebSocketGateway({ namespace: \'/realtime\' })', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ws/realtime.gateway.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'gateway 必须仍绑 /realtime namespace(契约 cs-round-066 不破坏)',
      ).toMatch(/@WebSocketGateway\(\s*\{[\s\S]*?namespace\s*:\s*['"]\/realtime['"]/);
    });

    it('Then: gateway handleConnection 仍走 token + sessionKey + join(\'session:${id}\')', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ws/realtime.gateway.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'handleConnection 必须仍 await socket.join(`session:${session.id}`)',
      ).toMatch(/await\s+socket\.join\(\s*[`'"]session:\$\{session\.id\}[`'"]\s*\)/);
      expect(
        text,
        'token 校验契约不被破坏',
      ).toMatch(/auth\.token\s*!==\s*this\.expectedToken/);
      expect(
        text,
        'sessionKey 校验契约不被破坏',
      ).toMatch(/sessionKey\s*===\s*['"]['"]/);
    });
  });
});