/**
 * @status implemented
 * @change-id cs-round-033
 * @incident-id T-20260807003 (ticket 14 转人工分配给客服)
 * @incident-date 2026-08-07
 * @root-cause ERP /tickets 详情页分配工单给客服 404 — 前端 use-tickets.ts:70 useAssignTicket()
 *              用 request.post(),后端 ticket.controller.ts:78 是 @Put(':id/assign')。
 *              前端发了不存在路由的 POST,后端返回 `Cannot POST /api/tickets/14/assign`。
 *              同步错误还有:测试 use-tickets.test.tsx 断言 mockedPost(锁死错误动词,无法报警);
 *              TicketModals.tsx:27 注释写"POST /tickets/:id/assign",与后端不一致。
 *
 * cs-round-033:工单分配 HTTP 动词对齐 — 前端改 PUT,后端不变(REST 惯例:assignee 状态变更
 *              是 idempotent,PUT 语义正确;同 useUpdateTicketStatus 用 put)。
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. use-tickets.ts useAssignTicket() 必须 request.put(不再 request.post)
 *   B. use-tickets.test.tsx 分配测试用例断言 mockedPut(不再 mockedPost)
 *   C. TicketModals.tsx 文件头注释 "POST /tickets/:id/assign" → "PUT"
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

/** 过滤单行 // 注释和块注释行,避免 spec 假阳/假阴 */
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

describe('cs-round-033: 工单分配 HTTP 动词对齐', () => {
  // ── 契约 A:use-tickets.ts useAssignTicket() 用 PUT ──
  describe('Given: erp-admin-frontend use-tickets.ts useAssignTicket()', () => {
    it('Then: 必须用 request.put(不是 request.post)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-tickets.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 useAssignTicket 函数体
      const assignFn = text.match(
        /useAssignTicket\s*\(\s*\)\s*\{[\s\S]*?return\s+useMutation\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/,
      );
      expect(assignFn?.[0] ?? '', 'useAssignTicket() 必须存在').toBeTruthy();
      const body = assignFn![0];

      // 必须 request.put(`/tickets/${id}/assign`, ...)
      expect(
        body,
        'useAssignTicket() 必须用 request.put(`/tickets/${id}/assign`, { assigneeId })'
          + '— 后端 @Put 是路由,REST 语义正确(idempotent 状态变更)',
      ).toMatch(/request\.put\s*\(\s*`\/tickets\/\$\{id\}\/assign`/);

      expect(
        body,
        'useAssignTicket() 不应再用 request.post(后端无 POST 此路由,会 404)',
      ).not.toMatch(/request\.post\s*\(\s*`\/tickets\/\$\{id\}\/assign`/);
    });
  });

  // ── 契约 B:use-tickets.test.tsx 分配测试断言 mockedPut ──
  describe('Given: erp-admin-frontend use-tickets.test.tsx 分配测试用例', () => {
    it('Then: 必须断言 mockedPut(不再 mockedPost)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-tickets.test.tsx',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');

      // 抠出 assign 测试用例(it(...))
      // 用最宽松的:从 "assign" 字符串往上找最近的 `it(`,然后抠到匹配的 `});`
      const lines = text.split('\n');
      const assignLineIdx = lines.findIndex((l) => l.includes('/assign'));
      expect(
        assignLineIdx >= 0,
        'test 文件应包含 "/assign" 字符串(分配测试)',
      ).toBe(true);

      // 从该行往上找最近的 it( 或 test( 起点
      let startIdx = assignLineIdx;
      while (startIdx >= 0) {
        const line = lines[startIdx];
        if (/^\s*(it|test)\s*\(/.test(line)) break;
        startIdx--;
      }
      expect(startIdx >= 0, '应能找到分配测试的 it(...) 起点').toBe(true);

      // 抠到 it 闭合 `});`(找下一个 `it(` 或文件结尾前最近的 `});`)
      let endIdx = startIdx + 1;
      let depth = 0;
      for (let i = startIdx; i < lines.length; i++) {
        const l = lines[i];
        for (const ch of l) {
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
        }
        if (depth <= 0 && i > startIdx) {
          endIdx = i;
          break;
        }
      }
      const assignTestBlock = lines.slice(startIdx, endIdx + 1).join('\n');

      expect(
        assignTestBlock,
        '分配测试用例必须断言 mockedPut(对齐源文件改动)',
      ).toMatch(/mockedPut/);

      expect(
        assignTestBlock,
        '分配测试用例不应再断言 mockedPost(已废弃)',
      ).not.toMatch(/mockedPost/);
    });
  });

  // ── 契约 C:TicketModals.tsx 文件头注释 "POST /tickets/:id/assign" → "PUT" ──
  describe('Given: erp-admin-frontend TicketModals.tsx 文件头注释', () => {
    it('Then: 注释 "POST /tickets/:id/assign" 必须改为 "PUT"', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/components/ticket/TicketModals.tsx',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');

      expect(
        text,
        '注释必须写 "PUT /tickets/:id/assign"(对齐后端路由)',
      ).toMatch(/PUT\s+\/tickets\/:id\/assign/);

      expect(
        text,
        '不应再写 "POST /tickets/:id/assign"(与后端路由不一致)',
      ).not.toMatch(/POST\s+\/tickets\/:id\/assign/);
    });
  });
});