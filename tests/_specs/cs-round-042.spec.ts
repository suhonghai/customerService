/**
 * @status implemented
 * @change-id cs-round-042
 * @incident-id T-20260810006
 * @incident-date 2026-08-10
 * @root-cause ai-cs 用户点 sidebar ✏️ 改会话标题,UI 立即刷新但**后端没存**。
 *   `ai-cs-demo/src/hooks/use-sessions.ts:307-314` `renameSession` 注释写「调后端
 *   PATCH visitorName,fire-and-forget」,函数体**只有 setSessions 本地更新**,
 *   没有 fetch。刷新页面 / 换设备后标题被 deriveTitle 派生值覆盖。
 *
 * cs-round-042 走正经 PATCH 路径(浏览器 → Next.js BFF → backend → DB):
 *   - 后端新增 PATCH /api/internal/cs/sessions/by-key/:sessionKey
 *     (对齐 cs-round-005 DELETE by-key 风格,no-op 友好)
 *   - BFF /api/cs/sessions/[sessionId]/rename/route.ts(server-side 转发 + token)
 *   - ai-cs erp-admin-client.renameSessionByKey 走 BFF 相对路径(同 cs-round-039
 *     closeTicketBySession 修法,绕开浏览器 token undefined)
 *   - use-sessions renameSession 改 async + 乐观更新 + 失败 revert + throw(让
 *     RAGChat 走 ErrorBubble;不退回 fire-and-forget 静默失败)
 *   - 落库字段:csSession.visitorName(schema 没有独立 title 列,visitorName 复用为 title)
 *
 * Spec 契约(代码契约 grep,fs 读源码 + 正则):
 *
 *   A. backend controller 有 @Patch('sessions/by-key/:sessionKey') + 调
 *      this.internalService.renameSessionByKey
 *   B. backend service renameSessionByKey 用 prisma.csSession.findUnique({where:
 *      {sessionKey}}) + update({data:{visitorName: title}}) — 反例:不能有 title 列
 *   C. backend DTO RenameSessionDto.title 有 IsString + MaxLength(50)
 *   D. BFF /api/cs/sessions/[sessionId]/rename/route.ts 文件存在 + PATCH + 转发
 *      到 /api/internal/cs/sessions/by-key/... + 带 X-Internal-Token
 *   E. ai-cs erp-admin-client.renameSessionByKey 走 BFF 相对路径
 *      /api/cs/sessions/${sessionKey}/rename + PATCH — 反例:不走 this.request
 *      (防 cs-round-038/039 token undefined bug 重现)
 *   F. ai-cs use-sessions.renameSession 调 getErpAdminClient().renameSessionByKey
 *      + 失败 setSessions 回滚 + throw — 反例:不留 fire-and-forget console.warn
 *      退化(防 updateActiveSession 那条 [title persist] failed 范式回流到 rename)
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

describe('cs-round-042: 会话重命名走正经 PATCH 路径(浏览器 → BFF → backend → DB)', () => {
  // ── 契约 A:backend controller 有 PATCH by-key 路由 ──
  describe('A. Given: erp-admin-backend internal.controller.ts', () => {
    it('Then: 必须有 @Patch("sessions/by-key/:sessionKey") + 调 renameSessionByKey', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.controller.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 @Patch('sessions/by-key/:sessionKey') 装饰器
      expect(
        text,
        'controller 必须有 @Patch("sessions/by-key/:sessionKey") 路由',
      ).toMatch(/@Patch\(['"]sessions\/by-key\/:sessionKey['"]\)/);

      // 必须有 renameSessionByKey handler(对应 service 调用)
      expect(
        text,
        'controller 必须有 renameSessionByKey handler',
      ).toMatch(/async\s+renameSessionByKey\s*\(/);

      // handler 内必须调 this.internalService.renameSessionByKey
      // 用整 file text 断言,handler 体较短(2-3 行)直接 toMatch 即可
      expect(
        text,
        'controller 必须调 this.internalService.renameSessionByKey',
      ).toMatch(/this\.internalService\.renameSessionByKey\s*\(/);
    });
  });

  // ── 契约 B:backend service renameSessionByKey 实现 ──
  describe('B. Given: erp-admin-backend internal.service.ts renameSessionByKey', () => {
    it('Then: 必须 findUnique by sessionKey + update visitorName(反例:不能有 title 列)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 renameSessionByKey 方法(用整文件 text 断言,不再抠 method body — body 内
      //   大量 `\n` 行都不是 `async`/`}`,lookahead 太脆弱)
      expect(text, 'service 必须有 async renameSessionByKey 方法').toMatch(
        /async\s+renameSessionByKey\s*\([\s\S]*?\)\s*\{/,
      );

      // 必须用 prisma.csSession.findUnique by sessionKey(no-op friendly pattern)
      // sessionKey 是对象 KEY,后面跟 , 或 } — 接受任意一种
      expect(
        text,
        'service 必须先 prisma.csSession.findUnique({where:{sessionKey}}) 归属校验',
      ).toMatch(/prisma\.csSession\.findUnique\s*\(\s*\{[\s\S]*?where\s*:\s*\{\s*sessionKey\s*[,}]/);

      // 必须 update visitorName(复用列,不是 title)
      expect(
        text,
        'service 必须 update visitorName(对齐 schema 当前实际列)',
      ).toMatch(/update\s*\(\s*\{[\s\S]*?data\s*:\s*\{[\s\S]*?visitorName\s*:/);

      // 反例不在 spec 里硬写 — 文件其他方法(upsertSession / createEscalation 等)
      // 合法使用 `data: { title: ... }`,全局 anti-pattern 会假阳性。
      // 正断言(update + visitorName)已锁死 rename 必须写 visitorName,反例冗余。
    });
  });

  // ── 契约 C:backend DTO RenameSessionDto 字段校验 ──
  describe('C. Given: erp-admin-backend rename-session.dto.ts', () => {
    it('Then: RenameSessionDto.title 必须 IsString + MaxLength(50)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/dto/rename-session.dto.ts',
      );
      expect(existsSync(p), 'RenameSessionDto 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须 export RenameSessionDto class
      expect(
        text,
        'DTO 文件必须 export RenameSessionDto class',
      ).toMatch(/export\s+class\s+RenameSessionDto/);

      // title 字段必须有 IsString + MaxLength(50)
//   用整 file text 断言 — DTO 文件小,直接 toMatch 即可,不需要抠 span
      expect(text, 'DTO 必须有 title 字段声明').toMatch(/title\s*!?\s*:\s*string/);
      expect(text, 'title 字段必须有 @IsString 装饰器').toMatch(/@IsString\s*\(\s*\)/);
      expect(
        text,
        'title 字段必须有 @MaxLength(50) 装饰器(对齐 visitorName @db.VarChar(50))',
      ).toMatch(/@MaxLength\s*\(\s*50\s*\)/);
    });
  });

  // ── 契约 D:BFF rename route 文件存在 + 转发到 by-key ──
  describe('D. Given: ai-cs-demo BFF /api/cs/sessions/[sessionId]/rename/route.ts', () => {
    it('Then: 必须有 PATCH handler + 转发到 backend by-key + 带 X-Internal-Token', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/cs/sessions/[sessionId]/rename/route.ts',
      );
      expect(existsSync(p), 'BFF rename route 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 PATCH handler
      expect(text, 'BFF rename 必须 export async function PATCH').toMatch(
        /export\s+async\s+function\s+PATCH/,
      );

      // 必须 server-side 用 INTERNAL_TOKEN
      expect(
        text,
        'BFF rename 必须 server-side 用 process.env.INTERNAL_TOKEN(对齐 close-ticket 模式)',
      ).toMatch(/process\.env\.INTERNAL_TOKEN/);

      // 必须转发到 backend /api/internal/cs/sessions/by-key/:sessionKey
      expect(
        text,
        'BFF rename 必须转发到 backend /api/internal/cs/sessions/by-key/...',
      ).toMatch(/\/api\/internal\/cs\/sessions\/by-key\//);

      // 必须转发带 PATCH method + X-Internal-Token header
      expect(text, 'BFF rename 必须用 PATCH method').toMatch(/method\s*:\s*['"]PATCH['"]/);
      expect(text, 'BFF rename 必须带 X-Internal-Token header').toMatch(
        /['"]X-Internal-Token['"]\s*:\s*INTERNAL_TOKEN/,
      );
    });
  });

  // ── 契约 E:ai-cs erp-admin-client.renameSessionByKey 走 BFF 相对路径 ──
  describe('E. Given: ai-cs-demo erp-admin-client.ts renameSessionByKey', () => {
    it('Then: 必须直 fetch BFF 相对路径 + PATCH(反例:不走 this.request 防 token undefined)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 renameSessionByKey 方法体
      const method = text.match(
        /async\s+renameSessionByKey\s*\([\s\S]*?\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(method?.[0] ?? '', 'renameSessionByKey 方法必须存在').toBeTruthy();
      const body = method![0];

      // 必须 fetch BFF 浏览器相对路径
      expect(
        body,
        'renameSessionByKey 必须 fetch BFF 相对路径 /api/cs/sessions/${sessionKey}/rename',
      ).toMatch(/\/api\/cs\/sessions\/[\s\S]*?\/rename/);

      // 必须用 PATCH method
      expect(
        body,
        'renameSessionByKey 必须用 PATCH method',
      ).toMatch(/method\s*:\s*['"]PATCH['"]/);

      // body 必须带 { title } JSON
      expect(
        body,
        'renameSessionByKey body 必须 JSON.stringify({ title })',
      ).toMatch(/JSON\.stringify\s*\(\s*\{\s*title/);

      // 反例:不能走 this.request(同 cs-round-038/039 防 token undefined)
      expect(
        body,
        'renameSessionByKey 不能走 this.request(浏览器端 token undefined → 抛错)',
      ).not.toMatch(/this\.request\s*[<(]/);
    });
  });

  // ── 契约 F:use-sessions.renameSession 调 erp + 失败回滚 + throw ──
  describe('F. Given: ai-cs-demo use-sessions.ts renameSession', () => {
    it('Then: 必须调 getErpAdminClient().renameSessionByKey + 失败 revert + throw(反例:不留 fire-and-forget)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 renameSession callback 方法体(useCallback 包了一层,抠里面的箭头函数)
      const method = text.match(
        /const\s+renameSession\s*=\s*useCallback\s*\([\s\S]*?\}\s*,\s*\[\]\s*\)/,
      );
      expect(method?.[0] ?? '', 'use-sessions.renameSession 必须存在').toBeTruthy();
      const body = method![0];

      // 必须调 getErpAdminClient().renameSessionByKey
      expect(
        body,
        'renameSession 必须调 getErpAdminClient().renameSessionByKey(走 BFF 后端同步)',
      ).toMatch(/getErpAdminClient\s*\(\s*\)\.renameSessionByKey\s*\(/);

      // 必须有 setSessions(乐观本地更新)— 这条与 E 配套:后端同步 + 本地显示
      expect(
        body,
        'renameSession 必须 setSessions 乐观本地更新(用户立刻看到新标题)',
      ).toMatch(/setSessions\s*\(/);

      // 失败 catch 必须有 setSessions 回滚(setSessions 含 prevTitle 引用)
      expect(
        body,
        'renameSession 失败 catch 必须 setSessions 回滚到 prevTitle',
      ).toMatch(/catch[\s\S]*?setSessions\s*\([\s\S]*?prevTitle/);

      // 失败必须 rethrow(让 RAGChat 接 ErrorBubble)
      expect(
        body,
        'renameSession catch 必须 throw e(让 RAGChat 走 ErrorBubble)',
      ).toMatch(/catch[\s\S]*?throw\s+e/);

      // 反例:不能 fire-and-forget 静默失败(updateActiveSession 那条范式)
      // 防 [title persist] failed console.warn 退化到 rename
      expect(
        body,
        'renameSession 不能 fire-and-forget(失败必须上抛给 RAGChat ErrorBubble)',
      ).not.toMatch(/\.catch\s*\(\s*\(\s*e\s*\)\s*=>\s*console\.warn/);
    });
  });
});