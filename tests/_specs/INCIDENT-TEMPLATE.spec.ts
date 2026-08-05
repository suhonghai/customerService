/**
 * INCIDENT-TEMPLATE — 事故回灌 spec 模板(2026-08-05 加)
 *
 * 用法:
 *   1) cp INCIDENT-TEMPLATE.spec.ts incident-<NNN>-<slug>.spec.ts
 *      例:incident-001-chat-undefined.spec.ts
 *   2) 填头部 @incident-id / @incident-date / @fixed-by / @root-cause
 *   3) 改 describe 标题 = INCIDENT-<NNN>: <一句话>
 *   4) it() 改 = 真验证:修复 commit hash 存在 / 修复代码 snippet 在某文件 / 已 deployed
 *   5) INDEX.md 加一行(业务场景列填 🚨 incident:)
 *   6) pnpm vitest run tests/_specs/incident-<NNN>-<slug>.spec.ts 验证 RED→GREEN
 *
 * 状态机:incident-recorded(刚发)→ accepted(复盘完成)→ implemented(修复 commit 在 main)
 * 永远留 implemented(作为历史锚点)。
 *
 * 为什么这么设计:ThoughtWorks 强调"production 反馈反向更新 spec",传统 SDD 单向容易
 * 出现"spec 写完跑通就停",事故发生时复用 spec 框架能强制记录"事故复盘 = 一等文档"。
 *
 * @status incident-recorded
 * @change-id incident-template
 * @author AI + you
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('INCIDENT-<NNN>: <事故一句话标题>', () => {
  // ── Scenario 1: 修复 commit 在 git 历史里(必填)────────────
  it('Then: 修复 commit <short-sha> 存在于 git log', () => {
    const hash = '<short-sha>';
    const log = execSync('git log --oneline -50', { encoding: 'utf-8' });
    expect(log).toMatch(new RegExp(`^${hash} `, 'm'));
  });

  // ── Scenario 2: 修复代码 snippet 在指定文件(必填)──────────
  it('Then: 修复代码 <file>:<line> 包含 <snippet>', () => {
    const file = '<file>';
    const snippet = '<expected-fix-snippet>';
    const src = readFileSync(file, 'utf-8');
    expect(src).toContain(snippet);
  });

  // ── Scenario 3: 复盘决策已记录(必填)──────────────────
  it('Then: 复盘包含 <root cause 一句话> 写在 fix commit body', () => {
    // 验证 commit body 含根因关键词,而不是空泛 "fix bug"
    const log = execSync('git log -1 --format=%B <short-sha>', { encoding: 'utf-8' });
    expect(log).toMatch(/<root-cause-keyword>/);
  });

  // ── Scenario 4: lessons learned(可选)──────────────
  // it('Then: lessons learned 写在 PR description / commit body', () => {
  //   // 如有"防止再次发生"的措施,在此断言存在
  // });
});
