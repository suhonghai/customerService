/**
 * @status draft
 * @change-id cs-round-019
 *
 * cs-round-019: upsert route BFF 透传 biz code,区分业务错 vs 上游宕机
 *
 * Why(为什么做):
 * 用户 curl POST /api/sessions/upsert 看到 `{"error":"erp-admin 业务错误
 * code=50000: 服务器异常"}` + HTTP 502,但实际:
 *   - 后端 BizException(50000) HTTP 状态本身是 200(构造里
 *     super(..., HttpStatus.OK))
 *   - 后端 body.code = 50000 是**业务码**,不是真上游宕机
 *   - erp-admin-client.ts:138 把后端 code !== 0 翻成 Error:
 *       throw new Error(`erp-admin 业务错误 code=${json.code}: ${json.message}`);
 *   - BFF upsert route catch 一律翻 502,前端看不到 code=50000 的具体含义
 *
 * 当前 BFF 错误处理丢失了关键语义:
 *   - 业务错(后端 BizException,例如 50000 服务器异常 / 20001 参数错 / 30001 资源不存在)
 *     都跟"上游宕机"一样翻 502
 *   - body.code 没透传,前端只能从 message 字符串里反推
 *   - 真实网络错误(fetch throw / res.json parse fail)跟业务错无法区分
 *
 * cs-round-017 已守 history route 的 1404/502 区分 + biz code 透传,
 * cs-round-019 把同样契约搬到 upsert route(以及顺带 list route)。
 *
 * 修法:
 *   upsert route catch 块:
 *     const raw = (e as Error).message || 'upsert 失败';
 *     console.error('[api/sessions/upsert] failed:', raw);
 *     // erp-admin-client 抛的 message 形如 "erp-admin 业务错误 code=50000: 服务器异常"
 *     const bizMatch = raw.match(/\bcode\s*=\s*(\d+)\b/);
 *     const bizCode = bizMatch ? Number(bizMatch[1]) : null;
 *     const isBiz = bizCode !== null;
 *     return NextResponse.json(
 *       { error: raw, code: isBiz ? bizCode : 'UPSTREAM' },
 *       { status: 502 },
 *     );
 *
 *   - 业务错:body.code = 具体 bizCode(50000 / 20001 / 30001 等),
 *             HTTP 保留 502(因为 BFF 视角后端是上游,但语义已区分)
 *   - 真实网络错:body.code = 'UPSTREAM'(字符串哨兵),HTTP 502
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — upsert route catch 块必含 biz code 透传
 *     Given ai-cs-demo/src/app/api/sessions/upsert/route.ts 源码
 *     Then  catch 块必出现 \`isBiz\` 或等价判定变量
 *     And   catch 块必出现 \`code: isBiz ? bizCode : 'UPSTREAM'\` 或等价三元
 *     And   catch 块必保留 HTTP 502 兜底(业务错也是 502,只是语义透传)
 *
 *   Scenario 2: 行为 — 后端抛 BizException(code=50000),BFF 透传 code=50000
 *     Given mock erp-admin-client.upsertSession throws Error(
 *       'erp-admin 业务错误 code=50000: 服务器异常')
 *     When  POST /api/sessions/upsert 跑通到 catch
 *     Then  response status === 502
 *     And   response body.code === 50000 (number,不是 'UPSTREAM' 字符串)
 *     And   response body.error 含 "服务器异常"
 *
 *   Scenario 3: 行为 — 真实网络错(fetch throw / parse fail),BFF 仍 'UPSTREAM'
 *     Given mock erp-admin-client.upsertSession throws Error(
 *       'erp-admin 请求失败(http://...): fetch failed')
 *     When  POST /api/sessions/upsert 跑通到 catch
 *     Then  response status === 502
 *     And   response body.code === 'UPSTREAM' (字符串哨兵)
 *
 * Out of scope:
 * - HTTP 状态码语义精细化(业务错也 502,BFF 视角后端是上游;
 *   真要 4xx 区分需另起 spec,跟当前 erp-admin-client 的 Error 翻 502 同基调)
 * - list / history / chat route 的同模式改造(history 已在 cs-round-017 修过)
 * - erp-admin-client 的 Error message 格式变化(契约稳定)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-019.spec.ts,
 *      验证 upsert route 源码契约 + 行为透传。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** 读源文件并剥掉注释 — 跟 cs-round-013/015/017/018 同模式 */
function readCode(relPath: string): string {
  const text = readFileSync(resolve(PKG, relPath), 'utf-8');
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/')
      );
    })
    .join('\n');
}

/** 提取 catch 块体(用 brace counter 避免 regex 嵌套截断) */
function extractCatchBlock(code: string): string {
  const m = code.match(/catch\s*\([^)]*\)\s*\{/);
  if (!m || m.index === undefined) return '';
  const openIdx = m.index + m[0].length;
  let depth = 1;
  let i = openIdx;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return code.slice(openIdx, i - 1);
}

describe('cs-round-019: upsert route BFF 透传 biz code + 区分 UPSTREAM', () => {
  beforeEach(() => {
    vi.resetModules(); // 防止 Scenario 间 mock 泄漏
  });

  // ── Scenario 1: 源码契约 ──
  describe('Scenario 1: upsert route catch 块源码契约', () => {
    it('Then catch 块必含 biz code 透传 + isBiz 判定 + HTTP 502 兜底', () => {
      const code = readCode('src/app/api/sessions/upsert/route.ts');
      const catchBody = extractCatchBlock(code);
      expect(catchBody, '应能找到 upsert route 的 catch 块').not.toBe('');

      // 关键 token grep — 4 个契约点都要命中
      expect(
        catchBody,
        'catch 块必含 \`bizMatch\` 或 \`bizCode\` 变量(从 message 抓 biz code)',
      ).toMatch(/\bbizMatch\b|\bbizCode\b/);

      expect(catchBody, 'catch 块必含 isBiz / hasBizCode 之类判定变量').toMatch(
        /\bisBiz\b|\bhasBizCode\b|bizCode\s*[!=]==?\s*null/,
      );

      expect(catchBody, "catch 块必含 'UPSTREAM' 字符串哨兵").toMatch(/['"]UPSTREAM['"]/);

      // body.code 透传 + 502 兜底
      expect(
        catchBody,
        'catch 块 body.code 必含 bizCode 透传或 UPSTREAM 哨兵(三元 / if 都行)',
      ).toMatch(/code\s*:[^,\n}]*(bizCode|UPSTREAM)/);
      expect(catchBody, 'catch 块必须保留 HTTP 502 兜底').toMatch(/status:\s*502/);
    });
  });

  // ── Scenario 2: 行为 — BizException → code=50000 透传 ──
  describe('Scenario 2: 行为 — BizException 50000 透传', () => {
    it('Then response status=502, body.code=50000 (number), body.error 含 "服务器异常"', async () => {
      // mock erp-admin-client.getErpAdminClient().upsertSession 抛 BizException 错
      vi.doMock('@/lib/erp-admin-client', () => ({
        getErpAdminClient: () => ({
          upsertSession: vi
            .fn()
            .mockRejectedValue(new Error('erp-admin 业务错误 code=50000: 服务器异常')),
        }),
      }));

      // 动态 import route handler(用 ?url 或直接读源码执行环境由 vitest 处理)
      // 这里改为直接测 catch 块里的判定逻辑 — 通过读源码 + grep 行为等价的辅助函数
      // 真正的 Next.js route runtime 测试需要 e2e,这里退化为契约 + 单元化判定函数
      const { POST } = await import('./app/api/sessions/upsert/route');
      const req = new Request('http://localhost/api/sessions/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'cs-test',
          visitorId: 'visitor-test',
        }),
      });

      const res = await POST(req as unknown as Parameters<typeof POST>[0]);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { code?: unknown; error?: string };
      expect(body.code, 'biz code 必须透传成 number 50000').toBe(50000);
      expect(typeof body.code).toBe('number');
      expect(body.error, 'body.error 必须含具体 message').toMatch(/服务器异常/);

      vi.doUnmock('@/lib/erp-admin-client');
    });
  });

  // ── Scenario 3: 行为 — 真实网络错 → 'UPSTREAM' 哨兵 ──
  describe('Scenario 3: 行为 — 真实网络错仍 UPSTREAM', () => {
    it('Then response status=502, body.code="UPSTREAM" 字符串哨兵', async () => {
      vi.doMock('@/lib/erp-admin-client', () => ({
        getErpAdminClient: () => ({
          upsertSession: vi
            .fn()
            .mockRejectedValue(
              new Error('erp-admin 请求失败(http://127.0.0.1:3001/api/...): fetch failed'),
            ),
        }),
      }));

      const { POST } = await import('./app/api/sessions/upsert/route');
      const req = new Request('http://localhost/api/sessions/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: 'cs-test', visitorId: 'visitor-test' }),
      });

      const res = await POST(req as unknown as Parameters<typeof POST>[0]);
      expect(res.status).toBe(502);
      const body = (await res.json()) as { code?: unknown; error?: string };
      expect(body.code, '真实网络错必须是 "UPSTREAM" 字符串哨兵').toBe('UPSTREAM');
      expect(typeof body.code).toBe('string');

      vi.doUnmock('@/lib/erp-admin-client');
    });
  });
});
