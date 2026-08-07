/**
 * @status implemented
 * @change-id cs-round-032
 * @incident-id T-20260807002
 * @incident-date 2026-08-07
 * @root-cause 改工单状态 400 — 前端 use-tickets.ts 发 { status },后端 DTO 字段名是 newStatus,
 *              class-validator whitelist 严格模式拒;即使字段修了,状态机错误也不告诉前端合法转移。
 *
 * cs-round-032:工单状态变更契约修正
 *   P0  DTO 字段名对齐 REST — newStatus → status(前端不变;后端改 2 文件)
 *   P1  状态机不合法时,error message 列出合法 next statuses
 *   P2  class-validator 错误信息拆分(多余字段 vs 缺/值错)便于排查
 *
 * Spec 契约(代码契约 grep,无需 MySQL 容器):
 *
 *   A. update-status.dto.ts 字段名是 `status`(不再是 newStatus)
 *   B. ticket.service.ts updateStatus() 读 dto.status(不再是 dto.newStatus)
 *   C. ticket.service.ts 状态机错误 message 包含 STATUS_LABELS 拼出的合法转移列表
 *   D. main.ts ValidationPipe 用 exceptionFactory 拆分错误(多余字段 vs 字段值错)
 *      或 forbidNonWhitelisted=false 容忍多余字段
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// 过滤掉单行 // 注释 + 块注释开闭行,避免 spec 假阳/假阴
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

describe('cs-round-032: 工单状态变更契约修正', () => {
  // ── 契约 A:DTO 字段名 = status(不再是 newStatus) ──
  describe('Given: erp-admin-backend ticket/dto/update-status.dto.ts', () => {
    it('Then: 字段必须是 status(不是 newStatus)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/ticket/dto/update-status.dto.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'DTO 字段名应为 status(REST 惯例,前端已用此名)',
      ).toMatch(/^\s*status\s*!/m);
      expect(
        text,
        'DTO 字段名不应再是 newStatus(已废弃)',
      ).not.toMatch(/^\s*newStatus\s*!/m);

      // 字段还应带 @IsInt() @IsIn([1,2,3,4]) 校验
      const fieldBlock = text.match(/@\w+\s*\(\s*\)[^\n]*\n[^\n]*status\s*!/);
      // 简化:确认 IsIn 还在且包含 1,2,3,4
      const isIn = text.match(/IsIn\s*\(\s*\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*\]\s*\)/);
      expect(
        isIn?.[0] ?? '',
        'status 字段仍需 @IsIn([1,2,3,4]) 校验(不放开非法值)',
      ).toBeTruthy();
    });
  });

  // ── 契约 B:ticket.service.ts updateStatus() 读 dto.status ──
  describe('Given: erp-admin-backend ticket.service.ts updateStatus()', () => {
    it('Then: 读 dto.status(不再读 dto.newStatus)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/ticket/ticket.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'updateStatus() 必须读 dto.status(对齐 DTO 字段名)',
      ).toMatch(/dto\.status\b/);

      // 但:别把 dto.status 也写成 dto.status(整个仓库只允许 1 个 updateStatus 读此字段)
      const dtoStatusCount = (text.match(/dto\.status\b/g) ?? []).length;
      // 至少 1 处读 dto.status,且不读 dto.newStatus
      expect(
        dtoStatusCount,
        'dto.status 至少出现 1 次',
      ).toBeGreaterThanOrEqual(1);
      expect(
        text,
        '不应再读 dto.newStatus(已改名)',
      ).not.toMatch(/dto\.newStatus\b/);
    });
  });

  // ── 契约 C:状态机错误 message 含合法转移列表 ──
  describe('Given: ticket.service.ts 状态机错误 message', () => {
    it('Then: 非法转移错误信息必须包含合法 next status label 列表', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/ticket/ticket.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 找 updateStatus 内 STATE_NOT_ALLOW 的 throw 块
      const updateStatusMatch = text.match(/async\s+updateStatus\s*\(/);
      expect(updateStatusMatch?.[0] ?? '').toBeTruthy();
      const startIdx = updateStatusMatch!.index!;
      // 抠出整个方法体(第一个匹配的 `{...}`)
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
      const methodBody = text.slice(startIdx, i + 1);

      // 找 throw new BizException(BizCode.STATE_NOT_ALLOW, ...) — 含 `allowed` 引用
      const notAllowedThrow = methodBody.match(
        /BizException\s*\(\s*BizCode\.STATE_NOT_ALLOW\s*,[\s\S]*?allowed[\s\S]*?\)\s*;/,
      );
      expect(
        notAllowedThrow?.[0] ?? '',
        '状态机非法转移错误必须 throw BizException(STATE_NOT_ALLOW, ...) 且 message 引用 allowed 数组',
      ).toBeTruthy();

      // message 必须包含 STATUS_LABELS 引用(label 化展示)
      expect(
        notAllowedThrow![0],
        '状态机错误 message 应包含 STATUS_LABELS[allowed[i]](中文 label),而非裸数字',
      ).toMatch(/STATUS_LABELS\s*\[/);

      // 至少拼出"合法转换"或"可转为"或"allowed"提示词
      expect(
        notAllowedThrow![0],
        '状态机错误 message 应有"合法转换"或类似提示词',
      ).toMatch(/(合法转换|可转|合法 next|allowed)/);
    });
  });

  // ── 契约 D:ValidationPipe 配置 — 拆分/容忍多余字段错误 ──
  describe('Given: erp-admin-backend main.ts ValidationPipe', () => {
    it('Then: ValidationPipe 必须拆分多余字段 vs 字段值错的错误,或容忍多余字段', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/main.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须配 ValidationPipe
      const validationPipeBlock = text.match(
        /new\s+ValidationPipe\s*\(\s*\{[\s\S]*?\}\s*\)/,
      );
      expect(
        validationPipeBlock?.[0] ?? '',
        'main.ts 必须 useGlobalPipes(new ValidationPipe({...}))',
      ).toBeTruthy();
      const block = validationPipeBlock![0];

      // 两种合法策略(任选其一即可):
      //   D1. forbidNonWhitelisted: false(容忍多余字段,silent strip)
      //   D2. exceptionFactory: (errors) => ... 自定义格式化
      const hasForbidOff = /forbidNonWhitelisted\s*:\s*false/.test(block);
      const hasExceptionFactory = /exceptionFactory\s*:/.test(block);

      expect(
        hasForbidOff || hasExceptionFactory,
        'ValidationPipe 必须配置 forbidNonWhitelisted=false 或 exceptionFactory 自定义,'
          + '避免错误信息把"多余字段"和"字段值错"混在一起',
      ).toBe(true);
    });
  });
});