/**
 * @status implemented
 * @change-id cs-round-039
 * @incident-id T-20260807005
 * @incident-date 2026-08-10
 * @root-cause 1:用户点"结束对话"报错 "ERP_ADMIN_TOKEN 未配置(.env.local)" — 同
 *   cs-round-038 bug 的服务端镜像:closeTicketBySession 走 this.request,在浏览器端
 *   getErpAdminToken() 返回 undefined → token undefined → throw。
 *   cs-round-038 只修了 getSessionOpenTicket,closeTicketBySession 仍走 this.request。
 *
 *              2:用户截图发"你好1",AI 答"我是小服..." — 但 banner 显示工单 OPEN。
 *   ai-cs log 报 "[chat] open-ticket probe failed: Failed to parse URL from
 *   /api/cs/sessions/284/open-ticket"。cs-round-038 第二版把
 *   getSessionOpenTicket 改成相对路径 fetch,client-side 浏览器 OK(相对路径),
 *   但 server-side (chat/route.ts in Node.js) `fetch('/api/cs/sessions/...')`
 *   Node.js fetch 必须有绝对 URL,parse URL 失败 → catch 兜底 → fall through
 *   调 LLM → AI 正常回答。
 *
 * cs-round-039 修两处:
 *   - erp-admin-client.closeTicketBySession:同 getSessionOpenTicket 改法,直 fetch 相对路径
 *   - chat/route.ts:不再走 erp.getSessionOpenTicket,直接 server-side fetch backend
 *     绝对 URL(process.env.ERP_ADMIN_URL + path + X-Internal-Token),绕开 BFF
 *     (server-side 可直连 backend)
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. erp-admin-client.ts closeTicketBySession 必须直 fetch 浏览器相对路径
 *      `/api/cs/sessions/${sessionKey}/close-ticket`,不再走 this.request
 *      (同 cs-round-038 getSessionOpenTicket 修法)
 *   B. chat/route.ts "open-ticket probe" 必须 server-side fetch
 *      process.env.ERP_ADMIN_URL/backend-path,不再走 erp.getSessionOpenTicket
 *      (避免 Node.js fetch 相对路径 parse URL 失败)
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

describe('cs-round-039: server/client dual fetch 修 2 bug', () => {
  // ── 契约 A:closeTicketBySession 走相对路径 fetch ──
  describe('A. Given: ai-cs-demo erp-admin-client.ts closeTicketBySession', () => {
    it('Then: 必须直 fetch 浏览器相对路径,不再走 this.request', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 closeTicketBySession 方法体
      const method = text.match(
        /async\s+closeTicketBySession\s*\([\s\S]*?\)\s*;/,
      );
      expect(method?.[0] ?? '', 'closeTicketBySession 方法必须存在').toBeTruthy();
      const body = method![0];

      // 必须 fetch 相对路径
      expect(
        body,
        'closeTicketBySession 必须 fetch 浏览器相对路径 /api/cs/sessions/${sessionKey}/close-ticket',
      ).toMatch(/\/api\/cs\/sessions\/[\s\S]*?close-ticket/);

      // 不应再走 this.request(防止 token undefined)
      expect(
        body,
        'closeTicketBySession 不应再走 this.request(浏览器端 token undefined 抛错)',
      ).not.toMatch(/this\.request\s*[<(]/);
    });
  });

  // ── 契约 B:chat/route.ts open-ticket probe server-side fetch ──
  describe('B. Given: ai-cs-demo chat/route.ts open-ticket probe', () => {
    it('Then: 必须 server-side fetch 绝对 URL,不再走 erp.getSessionOpenTicket(Node.js fetch 相对路径 parse 失败)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须用 process.env.ERP_ADMIN_URL(或其他 server-side env)拼绝对 URL
      // 抠 open-ticket probe 段(找 getSessionOpenTicket 或 open-ticket 相关 fetch)
      const probeSection = text.match(
        /openTicket[\s\S]{0,500}/,
      );
      expect(
        probeSection?.[0] ?? '',
        'open-ticket probe 段必须存在',
      ).toBeTruthy();

      // server-side 修法:用 fetch + process.env.ERP_ADMIN_URL(不用 erp.getSessionOpenTicket)
      expect(
        text,
        'chat/route.ts 必须有 server-side fetch 用 process.env.ERP_ADMIN_URL',
      ).toMatch(/process\.env\.ERP_ADMIN_URL[\s\S]{0,600}open-ticket/);

      // 反例:不能再用 erp.getSessionOpenTicket(避免 Node.js fetch 相对路径 parse 失败)
      expect(
        text,
        'chat/route.ts 不应再用 erp.getSessionOpenTicket(改 server-side 直接 fetch)',
      ).not.toMatch(/erp\.getSessionOpenTicket\s*\(/);
    });
  });

  // ── 契约 C:close-ticket BFF route 必须存在(补 closeTicketBySession 浏览器端路径) ──
  describe('C. Given: ai-cs-demo /api/cs/sessions/[sessionId]/close-ticket BFF', () => {
    it('Then: 必须存在 POST route,转发到 backend close-ticket endpoint', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/cs/sessions/[sessionId]/close-ticket/route.ts',
      );
      expect(existsSync(p), 'BFF close-ticket route 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须处理 POST
      expect(text, 'BFF close-ticket 必须 export async function POST').toMatch(
        /export\s+async\s+function\s+POST/,
      );

      // 必须 server-side 转发到 backend close-ticket(用 INTERNAL_TOKEN)
      expect(
        text,
        'BFF close-ticket 必须 server-side 转发到 backend(走 process.env.INTERNAL_TOKEN)',
      ).toMatch(/process\.env\.INTERNAL_TOKEN/);

      // 必须转发到 backend /api/internal/cs/sessions/.../close-ticket
      expect(
        text,
        'BFF close-ticket 必须转发到 backend /api/internal/cs/sessions/:sessionKey/close-ticket',
      ).toMatch(/\/api\/internal\/cs\/sessions\/[\s\S]*?close-ticket/);
    });
  });
});