/**
 * @status implemented
 * @change-id cs-round-014
 * // @cross-package: backend,ai-cs
 *
 * cs-round-014:修复点击 sidebar 会话 → URL 变成 /chat/undefined 的 bug。
 *
 * Why:
 * 用户复现 — 客服系统点击左边会话列表任一会话,地址栏变成
 *   http://localhost:9529/chat/undefined
 * 而不是 /chat/<真实 backend id>。
 *
 * 根因(契约漂移,非前端逻辑 bug):
 *   后端 erp-admin-backend/src/modules/internal/internal.service.ts `listSessions`
 *   调 prisma.csSession.findMany 时 `select` 漏掉了 `id`,map 输出对象也没带 id。
 *   前端 use-sessions.ts `RemoteSession.id: number`(必填)实际是 undefined,
 *   SessionList `onClick={() => onSwitch(String(s.id))}` 把 undefined 转字符串
 *   "undefined",URL 拼成 /chat/undefined。
 *
 * 契约(跨包 — backend 守门 + ai-cs 前端):
 *   A. 后端 internal.service.ts listSessions 的 findMany `select` 必须含 `id: true`
 *   B. 后端 internal.service.ts listSessions 的 rows.map 输出对象必须含 `id: r.id`
 *   C. 后端 internal.controller.ts listSessions 返回类型声明必须含 `id: number`
 *   D. 前端 SessionList 点击会话时,即便 s.id 为 null/undefined 也不能拼出
 *      /chat/undefined(防御性兜底;后端契约是主防线)
 *   E. 前端 use-sessions.ts RemoteSession.id 字段类型保持 number,运行时后端必返 id
 *
 * 落点(为什么放根 tests/_specs/ 而不是 backend/test/):
 *   - 跨包:后端契约 + 前端 UI 行为都要守门
 *   - 用户可见行为(URL 长什么样)— 任一端不跟进都 bug
 *   - 行为级断言 vs 实现细节:grep select/map 输出 + 守卫调用,而不是 mock fetch
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行,保留真实代码(同 cs-round-011 / cs-round-013)
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

describe('cs-round-014: listSessions 必返 id,SessionList 不能产生 /chat/undefined', () => {
  // ── 契约 A:后端 listSessions select 必须含 id ─────────────
  describe('Given: 后端 internal.service.ts listSessions 实现', () => {
    it('Then: csSession.findMany 的 select 包含 id: true(否则 id 字段进不到返回对象)', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 定位 listSessions 函数体里的 findMany select 块
      // 用最宽松的检查:存在 findMany + select + id 三个关键字在同一段代码里
      const selectBlock = codeOnly.match(/findMany\s*\(\s*\{[\s\S]*?select\s*:\s*\{[\s\S]*?\}\s*,?[\s\S]*?\}\s*\)/);
      expect(
        selectBlock?.[0] ?? '',
        'listSessions 内应能找到 csSession.findMany + select 块',
      ).toMatch(/id\s*:\s*true/);
    });

    it('Then: listSessions 的 rows.map 输出对象包含 id: r.id 字段', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.service.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 找 listSessions 函数体里的 rows.map(...) return 部分
      // 至少要出现 id: r.id(或者同等的等价写法 r.id 透出)
      expect(
        codeOnly,
        'listSessions map 输出必须含 id: r.id(或同等把 prisma row.id 透出)',
      ).toMatch(/id\s*:\s*r\.id/);
    });
  });

  // ── 契约 C:controller 返回类型声明同步 ──────────────────
  describe('Given: 后端 internal.controller.ts listSessions 返回类型', () => {
    it('Then: Promise<...> 里的 sessions 元素类型声明包含 id: number', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/internal/internal.controller.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      // 返回类型在 listSessions controller 方法签名里
      expect(text).toMatch(/sessions\s*:\s*Array\s*<[\s\S]*?id\s*:\s*number[\s\S]*?>/);
    });
  });

  // ── 契约 D:前端防御兜底 ─────────────────────────────
  describe('Given: ai-cs-demo SessionList 渲染会话条目', () => {
    it('Then: 点击会话的 onClick 前必须有 s.id 的 null/undefined 守卫', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/SessionList.tsx');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 必须显式守卫 s.id(== null / === null / == undefined / ?? null 任意一种)
      const hasGuard =
        /s\.id\s*==\s*null/.test(codeOnly) ||
        /s\.id\s*===\s*null/.test(codeOnly) ||
        /s\.id\s*!==\s*null/.test(codeOnly) || // 取反守卫
        /s\.id\s*==\s*undefined/.test(codeOnly) ||
        /s\.id\s*===\s*undefined/.test(codeOnly) ||
        /s\.id\s*\?\?/.test(codeOnly) ||
        /s\.id\s*\?\.?/.test(codeOnly); // 可选链 s.id?.toString()

      expect(
        hasGuard,
        'SessionList 必须有 s.id 的 null/undefined 守卫(否则后端契约漏 id 时会拼 /chat/undefined)',
      ).toBe(true);

      // 双保险:onClick 体里第一句应该是「id 不存在则不调 onSwitch」 — 不能是直接 onSwitch(String(s.id))
      // 抽 onClick 的箭头函数体做粗略校验
      const onClickMatch = codeOnly.match(
        /onClick\s*=\s*\{\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\}/,
      );
      expect(onClickMatch, 'SessionList onClick 应是箭头函数块').toBeTruthy();
      const body = onClickMatch?.[1] ?? '';
      // body 里必须有 return(或 if + return),且 onSwitch 必须在守卫之后
      const hasEarlyReturn = /if\s*\([^)]*\)\s*return/.test(body);
      expect(hasEarlyReturn, 'onClick 函数体里必须有 if + return 守卫').toBe(true);
    });
  });

  // ── 契约 E:use-sessions RemoteSession.id 类型 ─────────────
  describe('Given: ai-cs-demo use-sessions RemoteSession 类型契约', () => {
    it('Then: RemoteSession.id: number + Session.id: number 类型保持', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      // 接口契约 — 不应改 number → string(改了就和路由 /chat/[sessionId] 不兼容)
      expect(text).toMatch(/interface\s+RemoteSession[\s\S]*?id\s*:\s*number/);
      expect(text).toMatch(/interface\s+Session[\s\S]*?id\s*:\s*number/);
    });
  });

  // ── 后端 e2e spec 必须存在 ─────────────────────────
  describe('Given: 后端 jest e2e spec 守门', () => {
    it('Then: erp-admin-backend/test/cs-round-014.e2e-spec.ts 存在且至少 2 个 scenario', () => {
      const specPath = resolve(
        ROOT,
        'erp-admin-backend/test/cs-round-014.e2e-spec.ts',
      );
      expect(existsSync(specPath), 'cs-round-014 后端 spec 应存在').toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
    });
  });
});