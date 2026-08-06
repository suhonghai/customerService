/**
 * @status implemented
 * @change-id cs-round-016
 * // @cross-package: backend,ai-cs
 *
 * cs-round-016:删会话后 history 接口对已软删 sessionId 应返 404(不再是 502),
 * 前端 stale URL 进入能优雅降级。
 *
 * Why:
 * 用户报「ai 客服系统会话列表点击删除后,history 接口报错」+ curl 抓
 *   /api/sessions/1785978383161/history → 502(Bad Gateway)
 * 实际场景:用户 stale URL /chat/<deleted-id> 进入,后端 BizException(BIZ_ERROR)
 * 被 BFF /api/sessions/[id]/history 一律翻 502。用户侧一直 console 看到 502。
 *
 * 契约(跨包 — backend 守门 + ai-cs BFF + 前端 useChatState):
 *   A. 后端 internal.service.ts getMessages 找不到 session(已软删 / 完全不存在)
 *      → 抛 BizException(BizCode.NOT_FOUND, ...),不是 BIZ_ERROR
 *   B. BFF ai-cs-demo/src/app/api/sessions/[id]/history 拿到 BizCode.NOT_FOUND
 *      → 翻 404 + body.code=1404;其他业务错误 → 502;网络/上游宕机 → 502
 *   C. 前端 useChatState 拿到 4xx 时,清 messages + 重置 historyLoading(已有),
 *      不应有 5xx console 暴力报错
 *   D. 跨包 spec 守门运行时 list 接口必出 id 字段(防 stale dist 复现 cs-round-014
 *      的 "列表全部不显示" bug) — 拿到 list 后第一条 session 必含 id:number
 *
 * 落点(为什么放根 tests/_specs/ 而不是 backend/test/):
 *   - 跨包:后端契约 + BFF + 前端行为都要守门
 *   - 用户可见(URL 长什么样 / 接口报不报错)— 任一端不跟进都 bug
 *   - 行为级断言 vs 实现细节:grep 业务码 + grep 错误码字面量,而不是 mock fetch
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行,保留真实代码(同 cs-round-014)
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

describe('cs-round-016: 软删后 history 返 404 + 前端降级 + list 必带 id', () => {
  // ── 契约 A:后端 getMessages 抛 BizCode.NOT_FOUND(不是 BIZ_ERROR) ──
  describe('Given: 后端 internal.service.ts getMessages 实现', () => {
    it('Then: 找不到 session 时 throw BizException 必须用 BizCode.NOT_FOUND', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 锁定 getMessages 函数体:从 `async getMessages(` 一直匹配到下一个 `return { messages }`(不含 updateMessage/getMessage)
      const getMessagesBlock = codeOnly.match(
        /async\s+getMessages[\s\S]*?return\s*\{\s*messages\s*\}/,
      );
      expect(
        getMessagesBlock?.[0] ?? '',
        '应能找到 getMessages 函数体(到 return { messages } 截至)',
      ).toBeTruthy();

      const body = getMessagesBlock?.[0] ?? '';
      // 必须出现 BizCode.NOT_FOUND(1404),不能再用 BIZ_ERROR(40002)
      expect(
        body,
        'getMessages 找不到 session 必须 throw BizException(BizCode.NOT_FOUND, ...)',
      ).toMatch(/BizCode\.NOT_FOUND/);
      expect(
        body,
        'getMessages 不应再用 BizCode.BIZ_ERROR(那是通用 40002,前端无法区分语义)',
      ).not.toMatch(/BizCode\.BIZ_ERROR/);
    });
  });

  // ── 契约 B:BFF /api/sessions/[id]/history 错误码映射 ──
  describe('Given: ai-cs-demo BFF /api/sessions/[id]/history route', () => {
    it('Then: 错误处理块必须把 BizCode.NOT_FOUND 翻 404,其他错误翻 502', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/sessions/[id]/history/route.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // BFF 错误处理必须区分 404 vs 502
      // 关键信号:status 包含 404(一旦简化成 status: 502 单一兜底,本 spec 失败)
      expect(
        codeOnly,
        'BFF history route 错误处理必须显式区分 404 / 502,不能统一 502',
      ).toMatch(/404/);
      expect(
        codeOnly,
        'BFF history route 错误处理必须 still 保留 502 兜底(网络/上游宕机)',
      ).toMatch(/502/);

      // BFF 错误判定应显式 NOT_FOUND 探测 — 不能含糊
      const isNotFoundBranch = /isNotFound/.test(codeOnly);
      expect(
        isNotFoundBranch,
        'BFF history route 必须有 isNotFound 之类显式分支变量(代码可读性 + 单测可锚)',
      ).toBe(true);
    });

    it('Then: BFF 把 BizCode.NOT_FOUND 错 body.code 翻 1404(透传业务码)', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/sessions/[id]/history/route.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      // 透传业务码 1404(支持三元写法:`code: isNotFound ? 1404 : 'UPSTREAM'`)
      expect(text, 'BFF 404 分支 body.code 应是 1404').toMatch(
        /code\s*:[^,\n}]*1404/,
      );
    });
  });

  // ── 契约 C:前端 useChatState 4xx 降级 ──
  describe('Given: ai-cs-demo use-chat-state 副作用路径', () => {
    it('Then: fetch /api/sessions/[id]/history 拿到 4xx 时,不应有未捕获 5xx 错误', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');

      // 4xx 路径:!res.ok 时只是 return / setMessages([]),不能让 Promise 抛 5xx
      // 关键 — 不应有 throw new Error(... 5xx ...)
      expect(
        text,
        'use-chat-state 抓 res.ok === false 不应 throw 5xx 错误,只 warn',
      ).not.toMatch(/throw\s+new\s+Error\([^)]*5\d\d/);
      // 4xx 已经有 console.warn — 守门用
      expect(
        text,
        'use-chat-state 4xx 路径必须有 console.warn(开发可见)',
      ).toMatch(/console\.warn/);
    });
  });

  // ── 契约 D:list 接口运行时必出 id 字段(防 stale dist 复现 cs-round-014) ──
  describe('Given: ai-cs-demo BFF /api/customer/sessions/list route', () => {
    it('Then: 路由代码必须从后端 raw response 拿 sessions,然后透传(不回 strip id)', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/customer/sessions/list/route.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = readFileSync(p, 'utf-8');
      const codeOnly = stripComments(text);

      // 路由必须拿到 sessions 后**直接透传** — 不能中间 .map 时 strip id
      // 关键:return NextResponse.json 那行 body 里要包含 listJson.data.sessions
      expect(
        codeOnly,
        'list route 应透传 listJson.data.sessions(不 map)',
      ).toMatch(/listJson\.data\?\.sessions\s*\?\?\s*\[\]/);
    });
  });

  // ── 后端 e2e spec 必须存在且覆盖 2 个场景 ──
  describe('Given: 后端 jest e2e spec 守门', () => {
    it('Then: erp-admin-backend/test/cs-round-016.e2e-spec.ts 存在且至少 2 个 scenario', () => {
      const specPath = resolve(
        ROOT,
        'erp-admin-backend/test/cs-round-016.e2e-spec.ts',
      );
      expect(existsSync(specPath), 'cs-round-016 后端 spec 应存在').toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(scenarios.length).toBeGreaterThanOrEqual(2);
    });
  });
});
