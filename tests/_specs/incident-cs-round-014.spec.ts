/**
 * incident-cs-round-014 — 实战 demo(2026-08-05)
 *
 * @status implemented
 * @change-id incident-cs-round-014
 * @incident-id cs-round-014(W11 内部)
 * @incident-date 2026-08-05
 * @fixed-by 77f6dd3
 * @root-cause 后端 internal.service.ts listSessions 漏 select id,前端依赖 id 拼 URL 失败
 *
 * INCIDENT: 客服系统点击 sidebar 任一会话,URL 变成 /chat/undefined。
 *
 * 复盘:
 *  - 现象:用户多次反馈"点会话没反应"
 *  - 根因:后端 prisma.csSession.findMany select 漏 `id: true`,map 输出对象也没带 id;
 *    前端 use-sessions.ts `RemoteSession.id: number` 实际上是 undefined,onSwitch(String(s.id))
 *    把 undefined 转成 "undefined"
 *  - 修复 commit:77f6dd3 fix/cs round 014 fix chat undefined
 *  - 防线:(A) 后端契约主防线 — select + map 输出 id
 *         (B) 前端 SessionList 防御性兜底 — onClick s.id 为 null/undefined 时禁用
 *  - lessons learned:后端 select 字段必须含前端必填键(契约双轨),前端兜底不能替代主防线
 *
 * INDEX.md 加一行(2026-08-05):
 *   | incident-cs-round-014 | 🚨 incident: sidebar 点会话 → /chat/undefined | internal.service.ts:listSessions | implemented | erp-admin-backend/src/modules/internal/internal.service.ts | AI + you | 2026-08-05 |
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FIX_COMMIT = '77f6dd3';
const FIX_FILE = 'erp-admin-backend/src/modules/internal/internal.service.ts';

describe(`incident cs-round-014: sidebar 点击会话 → /chat/undefined`, () => {
  it(`Then: 修复 commit ${FIX_COMMIT} 在 git log`, () => {
    const log = execSync('git log --oneline -50', { encoding: 'utf-8' });
    expect(log).toMatch(new RegExp(`^${FIX_COMMIT} `, 'm'));
  });

  it(`Then: 修复文件 ${FIX_FILE} 含 select id: true(契约主防线 A)`, () => {
    const src = readFileSync(FIX_FILE, 'utf-8');
    // select 必须含 id:true — 否则 id 字段进不到返回对象
    expect(src).toMatch(/select[^]*\bid:\s*true/);
  });

  it(`Then: 修复文件 ${FIX_FILE} 含 rows.map 输出 id(契约主防线 A)`, () => {
    const src = readFileSync(FIX_FILE, 'utf-8');
    // map 输出对象必须含 id:r.id — 否则 frontend 拿到 undefined
    expect(src).toMatch(/rows\.map[^]*\{\s*[^}]*id:\s*r\.id/s);
  });

  it(`Then: 修复 commit body 写明根因(不是空泛 fix bug)`, () => {
    const body = execSync(`git log -1 --format=%B ${FIX_COMMIT}`, { encoding: 'utf-8' });
    // 至少提到 listSessions / select / id / 不然 ROOT CAUSE 没文字锚点
    expect(body).toMatch(/listSessions|select|id|undefined/);
  });
});
