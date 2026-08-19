/**
 * @status implemented
 * @change-id cs-round-066
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause prod session 119 截图(2026-08-19 14:46):用户在 AI 客服页面
 *   (chat.suhhai.cn/chat/119,已转人工)发消息,ERP 后台(app.suhhai.cn/tickets)
 *   "对话流"收不到实时推送,必须刷新才能看到。Network 面板显示 /api/chat 200,
 *   后端 ack 路径 emit user_message 已被调用,DB cs_message 也写入(id=139/140)
 *   — 但 ERP WS 监听没收到。
 *
 *   实测(socket.io-client 模拟 ERP 连 prod):
 *     - WS 握手 OK(auth 通过 token + sessionKey 校验,sid=1ZykrWqgCOlcL0oaAAGn)
 *     - curl POST /api/chat 走 ack 路径,DB 写入 cs_message 成功
 *     - **WS 监听 socket 没收到 user_message 事件** ❌
 *
 *   根因:
 *     `realtime.gateway.ts` 是 `@WebSocketGateway({ namespace: '/realtime' })`,
 *     所有 client(ai-cs-demo `connectRealtime` + ERP `useConversation`)
 *     都连 `/realtime` namespace。
 *
 *     但所有 emit 端(6 处)用:
 *       this.realtime.server.to(`session:${id}`).emit(event, payload)
 *
 *     `this.realtime.server` 是 NestJS `@WebSocketServer()` 注入的 server 实例。
 *     在 namespace gateway 下,默认行为应该注入 namespace 实例,但 socket.io 中
 *     `server.to(room)` 的 room 与 `namespace.to(room)` 的 room 是两个**隔离**
 *     的 broadcast group —— 即使不 throw,emit 到错的 namespace 的 room 时,
 *     client 在另一个 namespace 收不到。
 *
 *     修复:显式 `this.realtime.server.of('/realtime').to(room).emit(...)`,
 *     不管 server 实际是什么实例,emit 都到 `/realtime` namespace 的 room。
 *
 *   影响范围 6 处(同一根因,不同事件):
 *     - internal.service.ts:307  user_message(upsertSession 路径)
 *     - internal.service.ts:376  user_message(appendMessage 路径)**主要症状**
 *     - internal.service.ts:711  ticket_created(转人工触发)
 *     - internal.service.ts:838  message_status(stale-streaming-reaped)
 *     - internal.service.ts:963  ticket_closed(user 主动关闭)
 *     - ticket.service.ts:424    ticket_closed(status=4 路径)
 *     - ticket.service.ts:516    operator_reply(客服回复)
 *
 * cs-round-066 修法(3 文件,~6 token 修改):
 *   A. internal.service.ts:4 处 emit 加 `.of('/realtime')` 修饰
 *   B. ticket.service.ts:2 处 emit 加 `.of('/realtime')` 修饰
 *   C. spec 校验所有 6 处都用 .of('/realtime') 且 gateway 仍绑 /realtime namespace
 *
 *   为什么不改 `@WebSocketServer()` decorator:
 *     - 改 NestJS 内部约定风险大、改动隐式
 *     - .of('/realtime') 是 socket.io 官方 API,语义最明确
 *
 *   Out of scope:
 *   - 改 client 端 namespace 路径(/realtime 与 client 一致,无需改)
 *   - 改 socket.io 部署模式(redis adapter)— 当前 prod 单实例 docker compose
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

describe('cs-round-066: WS emit 必须显式指定 /realtime namespace', () => {
  describe('A. internal.service.ts 的 4 处 emit 都用 .of(\'/realtime\')', () => {
    it('Then: user_message emit (upsertSession 路径, ~line 307) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约:upsertSession emit user_message 必须 .of('/realtime').to(...)
      // 匹配块必须同时含 `user_message` 事件 + `.of('/realtime').to(`
      // (单行 emit — upsertSession emit 是 this.realtime.server.of('/realtime').to(...).emit('user_message', ...))
      const userMessageEmitUpsert = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{[^}]+\}[`'"]\s*\)\.emit\(\s*['"]user_message['"]/,
      );
      expect(
        userMessageEmitUpsert?.[0] ?? '',
        'upsertSession user_message emit 必须用 .of(\'/realtime\').to(`session:${...}`).emit(\'user_message\', ...)',
      ).toBeTruthy();
    });

    it('Then: user_message emit (appendMessage 路径, ~line 376) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const userMessageEmitAppend = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{sessionId\}[`'"]\s*\)\.emit\(\s*['"]user_message['"]/,
      );
      expect(
        userMessageEmitAppend?.[0] ?? '',
        'appendMessage user_message emit 必须用 .of(\'/realtime\').to(`session:${sessionId}`).emit(\'user_message\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket_created emit (~line 711) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ticketCreatedEmit = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{sessionRow\.id\}[`'"]\s*\)\.emit\(\s*['"]ticket_created['"]/,
      );
      expect(
        ticketCreatedEmit?.[0] ?? '',
        'ticket_created emit 必须用 .of(\'/realtime\').to(`session:${sessionRow.id}`).emit(\'ticket_created\', ...)',
      ).toBeTruthy();
    });

    it('Then: message_status emit (~line 838) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const messageStatusEmit = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{m\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]message_status['"]/,
      );
      expect(
        messageStatusEmit?.[0] ?? '',
        'message_status emit 必须用 .of(\'/realtime\').to(`session:${m.sessionId}`).emit(\'message_status\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket_closed emit (~line 963, user close) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ticketClosedUserEmit = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{updated\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]ticket_closed['"]/,
      );
      expect(
        ticketClosedUserEmit?.[0] ?? '',
        'ticket_closed(user close) emit 必须用 .of(\'/realtime\').to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...)',
      ).toBeTruthy();
    });

    it('Then: internal.service.ts 必须没有裸 this.realtime.server.to( emit(root namespace 错路径)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 反向契约:任何 .to(`session:`...).emit 前面必须有 .of('/realtime')(可跨行)
      const nsOfCount = (
        text.match(/\.of\(\s*['"]\/realtime['"]\s*\)[\s\S]{0,40}?\.to\(\s*[`'"]session:\$\{/g) ?? []
      ).length;
      const toSessionCount = (text.match(/\.to\(\s*[`'"]session:\$\{/g) ?? []).length;
      expect(
        nsOfCount,
        'internal.service.ts: .of(/realtime).to(session: 出现次数(' +
          nsOfCount +
          ') 必须等于 .to(session: 出现次数(' +
          toSessionCount +
          ') — 否则有 emit 漏掉 namespace',
      ).toBe(toSessionCount);
    });
  });

  describe('B. ticket.service.ts 的 2 处 emit 都用 .of(\'/realtime\')', () => {
    it('Then: ticket_closed emit (status=4 路径, ~line 424) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 多行 emit:this.realtime.server[\n  ]*.of('/realtime')[\n  ]*.to(`session:${updated.sessionId}`)
      const ticketClosedStatus4Emit = text.match(
        /this\.realtime\.server[\s\S]{0,80}?\.of\(\s*['"]\/realtime['"]\s*\)[\s\S]{0,80}?\.to\(\s*[`'"]session:\$\{updated\.sessionId\}[`'"]\s*\)[\s\S]{0,30}?\.emit\(\s*['"]ticket_closed['"]/,
      );
      expect(
        ticketClosedStatus4Emit?.[0] ?? '',
        'ticket_closed(status=4) emit 必须用 .of(\'/realtime\').to(`session:${updated.sessionId}`).emit(\'ticket_closed\', ...) — 多行或单行都允许',
      ).toBeTruthy();
    });

    it('Then: operator_reply emit (~line 516) 必须显式 namespace', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const operatorReplyEmit = text.match(
        /this\.realtime\.server\.of\(\s*['"]\/realtime['"]\s*\)\.to\(\s*[`'"]session:\$\{exist\.sessionId\}[`'"]\s*\)\.emit\(\s*['"]operator_reply['"]/,
      );
      expect(
        operatorReplyEmit?.[0] ?? '',
        'operator_reply emit 必须用 .of(\'/realtime\').to(`session:${exist.sessionId}`).emit(\'operator_reply\', ...)',
      ).toBeTruthy();
    });

    it('Then: ticket.service.ts 必须没有裸 this.realtime.server.to( emit', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ticket/ticket.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const nsOfCount = (
        text.match(/\.of\(\s*['"]\/realtime['"]\s*\)[\s\S]{0,40}?\.to\(\s*[`'"]session:\$\{/g) ?? []
      ).length;
      const toSessionCount = (text.match(/\.to\(\s*[`'"]session:\$\{/g) ?? []).length;
      expect(
        nsOfCount,
        'ticket.service.ts: .of(/realtime).to(session: 出现次数(' +
          nsOfCount +
          ') 必须等于 .to(session: 出现次数(' +
          toSessionCount +
          ') — 否则有 emit 漏掉 namespace',
      ).toBe(toSessionCount);
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