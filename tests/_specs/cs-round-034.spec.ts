/**
 * @status implemented
 * @change-id cs-round-034
 * @incident-id T-20260807003 (ticket 14 分配后改状态)
 * @incident-date 2026-08-07
 * @root-cause ERP /tickets 改状态弹窗出现非法选项 status=0,后端 @IsIn([1,2,3,4])
 *              拒 400(`字段值错(1):status: status must be one of the following values: 1, 2, 3, 4`)。
 *              根因更深:前端 erp-admin-frontend/src/components/ticket/ticket-constants.ts
 *              的 TICKET_STATUS 整体偏移 1 位 — 多了 0 项,且 1/2 项文案错位(前端
 *              "处理中/待客户",后端权威 "待领取/处理中")。影响:
 *              - 改状态弹窗用户能选 0,选 0 必 400
 *              - 所有 ticket 列表/详情的 status badge 文案错位
 *                (ticket 14 status=2 后端是"处理中",前端显示"待客户")
 *
 * cs-round-034:TICKET_STATUS 对齐后端 Prisma 权威定义(1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭)
 *
 * Out of scope:
 *   - TICKET_PRIORITY 同样有偏移问题(后端 1 高 / 2 中 / 3 低,前端 0 低 / 1 中 / 2 高 / 3 紧急),
 *     留 cs-round-035 处理(同一根因,但不在用户当前报错范围)
 *
 * Spec 契约(代码契约 grep + 文件读取):
 *
 *   A. ticket-constants.ts TICKET_STATUS 必须只含 key 1/2/3/4(无 0)
 *   B. TICKET_STATUS[1].t === '待领取'
 *   C. TICKET_STATUS[2].t === '处理中'
 *   D. TICKET_STATUS[3].t === '已解决'
 *   E. TICKET_STATUS[4].t === '已关闭'
 *   F. 文件头注释必须与后端权威一致("1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭"),
 *      避免下次再漂移
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

describe('cs-round-034: 前端 TICKET_STATUS 对齐后端权威定义', () => {
  describe('Given: erp-admin-frontend ticket-constants.ts', () => {
    const p = resolve(
      ROOT,
      'erp-admin-frontend/src/components/ticket/ticket-constants.ts',
    );
    // 文件必须在
    it('Setup: ticket-constants.ts 必须存在', () => {
      expect(existsSync(p)).toBe(true);
    });

    // 抠出 TICKET_STATUS 对象字面量(逐行,避免正则跨对象误伤)
    const text = readFileSync(p, 'utf-8');
    const statusBlockMatch = text.match(
      /export\s+const\s+TICKET_STATUS\s*:\s*Record<number,\s*TagConf>\s*=\s*\{[\s\S]*?\};/,
    );
    const statusBlock = statusBlockMatch?.[0] ?? '';

    // ── 契约 A:必须只有 key 1/2/3/4,无 0 ──
    it('Then: TICKET_STATUS 必须只含 key 1/2/3/4(无 0)', () => {
      expect(
        statusBlock,
        'TICKET_STATUS 块必须存在',
      ).toBeTruthy();

      // 抽出所有数字 key
      const keys = [
        ...statusBlock.matchAll(/^\s*(\d+)\s*:\s*\{/gm),
      ].map((m) => Number(m[1]));
      const sortedKeys = [...keys].sort((a, b) => a - b);
      expect(
        sortedKeys,
        'TICKET_STATUS key 必须严格等于 [1,2,3,4](0 是非法值,会触发后端 400)',
      ).toEqual([1, 2, 3, 4]);
    });

    // ── 契约 B–E:文案必须对齐后端 ──
    it('Then: TICKET_STATUS[1].t === "待领取"(后端权威)', () => {
      expect(
        statusBlock,
        'TICKET_STATUS[1] 文案必须 = 待领取',
      ).toMatch(/1\s*:\s*\{\s*c\s*:\s*['"][^'"]*['"]\s*,\s*t\s*:\s*['"]待领取['"]/);
    });

    it('Then: TICKET_STATUS[2].t === "处理中"(后端权威)', () => {
      expect(
        statusBlock,
        'TICKET_STATUS[2] 文案必须 = 处理中',
      ).toMatch(/2\s*:\s*\{\s*c\s*:\s*['"][^'"]*['"]\s*,\s*t\s*:\s*['"]处理中['"]/);
    });

    it('Then: TICKET_STATUS[3].t === "已解决"(后端权威)', () => {
      expect(
        statusBlock,
        'TICKET_STATUS[3] 文案必须 = 已解决',
      ).toMatch(/3\s*:\s*\{\s*c\s*:\s*['"][^'"]*['"]\s*,\s*t\s*:\s*['"]已解决['"]/);
    });

    it('Then: TICKET_STATUS[4].t === "已关闭"(后端权威)', () => {
      expect(
        statusBlock,
        'TICKET_STATUS[4] 文案必须 = 已关闭',
      ).toMatch(/4\s*:\s*\{\s*c\s*:\s*['"][^'"]*['"]\s*,\s*t\s*:\s*['"]已关闭['"]/);
    });

    // ── 契约 F:文件头注释必须与后端一致,防下次漂移 ──
    it('Then: 文件头注释 status 注释必须含"1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭"', () => {
      expect(
        text,
        '文件头注释必须明确写"1 待领取 / 2 处理中 / 3 已解决 / 4 已关闭",'
          + '与后端 Prisma + ticket.service.ts 一致',
      ).toMatch(/status:\s*1\s*待领取\s*\/\s*2\s*处理中\s*\/\s*3\s*已解决\s*\/\s*4\s*已关闭/);

      // 反例:不能再有"0 待处理"或"2 待客户"这种错位注释
      expect(
        text,
        '不应再有"0 待处理"或"2 待客户"等错位注释',
      ).not.toMatch(/0\s*待处理|2\s*待客户/);
    });
  });
});