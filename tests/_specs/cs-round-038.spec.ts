/**
 * @status implemented
 * @change-id cs-round-038
 * @incident-id T-20260807004
 * @incident-date 2026-08-07
 * @root-cause ai-cs 浏览器端 useEffect 拉 getSessionOpenTicket 失败 → sessionHasOpenTicket
 *              永远 false → banner 不显示。
 *
 *              根因:erp-admin-client.ts:110 用 env.ERP_ADMIN_URL 作为 baseUrl,但
 *              ERP_ADMIN_URL 不是 NEXT_PUBLIC_*,浏览器端 process.env.ERP_ADMIN_URL
 *              是 undefined,fallback 到 'http://127.0.0.1:3001'。浏览器 fetch 跨域到
 *              127.0.0.1:3001 → CORS 失败 → useEffect 的 .catch() 吞错 →
 *              setSessionHasOpenTicket(false) → banner 不显示。
 *
 *              为什么"点击人工"能立即显示:后端 emit ticket_created → RAGChat onTicketCreated
 *              handler 纯本地 setState,不依赖网络。
 *
 * cs-round-038:Next.js BFF proxy 修 CORS — ai-cs 加 /api/cs/sessions/[id]/open-ticket route,
 *              server-side 代理到 backend /api/internal/cs/sessions/:id/open-ticket。
 *              client 改 fetch 走 BFF(浏览器相对路径,无 CORS)。
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. ai-cs-demo 必须新增 /api/cs/sessions/[sessionId]/open-ticket/route.ts BFF route
 *      (GET 处理,server-side 转发到 backend /api/internal/cs/sessions/:sessionId/open-ticket,
 *      带 X-Internal-Token)
 *   B. erp-admin-client.ts getSessionOpenTicket 内部必须调 BFF 相对路径
 *      (/api/cs/sessions/${id}/open-ticket),不再直接调 backend ERP_ADMIN_URL
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

describe('cs-round-038: ai-cs 浏览器端 useEffect 拉 ticket CORS 修复', () => {
  // ── 契约 A:BFF route 必须存在 ──
  describe('A. Given: ai-cs-demo BFF route /api/cs/sessions/[sessionId]/open-ticket', () => {
    it('Then: 必须存在并代理到 backend /api/internal/cs/sessions/:id/open-ticket', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/cs/sessions/[sessionId]/open-ticket/route.ts',
      );
      expect(existsSync(p), 'BFF route 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须处理 GET
      expect(text, 'BFF route 必须 export async function GET').toMatch(
        /export\s+async\s+function\s+GET/,
      );

      // 必须 server-side 转发到 backend(用 process.env.ERP_ADMIN_URL 或 NEXT_PUBLIC_API_BASE_URL)
      expect(
        text,
        'BFF route 必须 server-side 转发到 backend(走 ERP_ADMIN_URL 等 server-only env)',
      ).toMatch(/process\.env\.ERP_ADMIN_URL|process\.env\.NEXT_PUBLIC_API_BASE_URL/);

      // 必须带 X-Internal-Token(backend InternalGuard 要求)
      expect(text, '转发必须带 X-Internal-Token header').toMatch(/X-Internal-Token/);

      // 必须转发到 backend 的 /api/internal/cs/sessions/.../open-ticket
      expect(
        text,
        'BFF 必须转发到 backend /api/internal/cs/sessions/:id/open-ticket',
      ).toMatch(/\/api\/internal\/cs\/sessions\/[\s\S]*?\/open-ticket/);
    });
  });

  // ── 契约 B:client getSessionOpenTicket 必须改用 BFF 相对路径 ──
  describe('B. Given: ai-cs-demo erp-admin-client.ts getSessionOpenTicket', () => {
    it('Then: 必须 fetch BFF 相对路径 /api/cs/sessions/${id}/open-ticket,不再直连 backend', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 getSessionOpenTicket 方法体(找到 return 语句后的 ); 结束,避免被 Promise<...> 类型参数
    // 里的 } 误截断)
      const method = text.match(
        /async\s+getSessionOpenTicket\s*\([\s\S]*?\)\s*;/,
      );
      expect(method?.[0] ?? '', 'getSessionOpenTicket 方法必须存在').toBeTruthy();
      const body = method![0];

      // 方法体必须 fetch BFF 相对路径(不包含 ERP_ADMIN_URL)
      expect(
        body,
        'getSessionOpenTicket 必须 fetch BFF 相对路径 /api/cs/sessions/${id}/open-ticket',
      ).toMatch(/\/api\/cs\/sessions\/[\s\S]*?\/open-ticket/);

      // 反例:方法体不应再直连 backend 路径(防止双路径,确保只走 BFF)
      expect(
        body,
        'getSessionOpenTicket 不应再直连 backend /api/internal/cs/sessions/...(必须走 BFF)',
      ).not.toMatch(/\/api\/internal\/cs\/sessions/);
    });
  });
});