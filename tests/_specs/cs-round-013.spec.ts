/**
 * @status implemented
 * @change-id cs-round-013
 * // @cross-package: ai-cs,backend
 *
 * cs-round-013:聊天数据全部从接口获取,前端不再做客户端持久化
 * (移除 cs_sessions_v1 / cs_active_session_v1 / cs_backend_session_map_v1)。
 *
 * Why:
 * 旧实现把 sessions(含 messages)+ activeId + frontendId→backendId 映射都写
 * localStorage;导致 401 wipe / 跨设备状态分裂 / mount 时机竞速 等 bug。
 * 这次彻底砍掉 — sessions 来自后端 list,activeId 来自 URL,messages 来自 history。
 *
 * 契约(跨包 — backend 守门 + ai-cs 前端):
 *   A. 后端 GET /api/customer/sessions/list 必须返 sessionKey(前端 upsert 时用)
 *   B. 后端 GET /api/customer/sessions/list 必须返 messageCount(前端 messageCount 不再前端累加)
 *   C. ai-cs-demo 源码 grep `cs_sessions_v1` / `cs_active_session_v1` /
 *      `cs_backend_session_map_v1` 在**非注释代码行** = 0 命中
 *   D. ai-cs-demo /api/sessions/:id/history 端点保留(切 session 加载消息用)
 *
 * 落点(为什么放根 tests/_specs/):
 *   - 跨包(ai-cs 前端 + backend 后端)
 *   - 用户可见行为(刷新页面 / 切 session / 多设备)— 任一端不跟进都 bug
 *   - 行为级断言 vs 实现细节:grep 文件内容 + backend 字段 schema,而不是
 *     "useSessions 是否调 list"这种实现细节
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

describe('cs-round-013: 聊天数据全部从接口获取,无 localStorage', () => {
  // ── 契约 A+B:后端 list 返回的字段必须够前端用 ──
  describe('Given: 后端 /api/customer/sessions/list 实现', () => {
    it('Then: list 返回 RemoteSession 包含 sessionKey + messageCount 字段', () => {
      // 找 backend 控制器 / service 定义 RemoteSession 形状
      const candidates = [
        'erp-admin-backend/src/modules/internal/internal.controller.ts',
        'erp-admin-backend/src/modules/internal/internal.service.ts',
        'erp-admin-backend/src/modules/internal/dto/list-sessions.dto.ts',
        'erp-admin-backend/src/modules/internal/dto/upsert-session.dto.ts',
      ];
      let found = false;
      for (const c of candidates) {
        const p = resolve(ROOT, c);
        if (!existsSync(p)) continue;
        const t = readFileSync(p, 'utf-8');
        // sessionKey 字段在 list 响应里
        if (/sessionKey/i.test(t) && /messageCount/i.test(t)) {
          found = true;
          break;
        }
      }
      expect(
        found,
        '后端 list 必须同时包含 sessionKey 和 messageCount 字段(前端需要 sessionKey 调 upsert/messageCount 渲染 sidebar)',
      ).toBe(true);
    });
  });

  // ── 契约 C:ai-cs-demo 源码不持久化聊天相关 localStorage ──
  describe('Given: ai-cs-demo 源码', () => {
    const TARGETS = [
      'ai-cs-demo/src/hooks/use-sessions.ts',
      'ai-cs-demo/src/lib/components/RAGChat.tsx',
      'ai-cs-demo/src/hooks/use-chat-state.ts',
    ];
    const BANNED_KEYS = ['cs_sessions_v1', 'cs_active_session_v1', 'cs_backend_session_map_v1'];

    for (const target of TARGETS) {
      it(`Then [${target}]: 不出现 ${BANNED_KEYS.join(' / ')} 键名(非注释代码行)`, () => {
        const p = resolve(ROOT, target);
        expect(existsSync(p), `${target} 应存在`).toBe(true);
        const text = readFileSync(p, 'utf-8');
        // 注释行过滤掉(// 行 + jsdoc 块),保留真实代码
        const codeOnly = text
          .split('\n')
          .filter((line) => {
            const t = line.trimStart();
            return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/');
          })
          .join('\n');
        for (const key of BANNED_KEYS) {
          expect(
            codeOnly.includes(key),
            `${target} 代码行不应出现 "${key}"(已在 cs-round-013 移除聊天持久化)`,
          ).toBe(false);
        }
      });
    }
  });

  // ── 契约 D:/api/sessions/:id/history 端点保留 ──
  describe('Given: ai-cs-demo /api/sessions/:id/history 路由', () => {
    it('Then: history 路由文件仍存在(切 session 加载消息用)', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/sessions/[id]/history/route.ts',
      );
      expect(existsSync(p), 'history 路由必须保留').toBe(true);
      const text = readFileSync(p, 'utf-8');
      // 仍走 erp-admin getSessionMessages(数字 id)
      expect(text).toMatch(/getSessionMessages/);
    });
  });

  // ── 后端 e2e spec 必须存在(契约保护) ──
  describe('Given: 后端行为级 spec', () => {
    it('Then: erp-admin-backend/test/cs-round-013.e2e-spec.ts 存在且至少 2 个 scenario', () => {
      const specPath = resolve(
        ROOT,
        'erp-admin-backend/test/cs-round-013.e2e-spec.ts',
      );
      expect(existsSync(specPath), 'cs-round-013 后端 spec 应存在').toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(
        scenarios.length,
        'cs-round-013 后端 spec 应有 ≥2 个 describe',
      ).toBeGreaterThanOrEqual(2);
    });
  });
});