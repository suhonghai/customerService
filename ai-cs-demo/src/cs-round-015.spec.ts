/**
 * @status draft
 * @change-id cs-round-015
 *
 * cs-round-015: 修 WS sessionKey 错传 + upsert 完成后 URL 不更新
 *
 * Why(为什么做):
 * 用户报 "ai 客服创建新会话接口报错",给的 curl(POST /api/sessions/upsert)其实
 * 返回 200 `{id:219}`。Playwright 抓真实 UI 网络/console 后定位到 2 个真 bug:
 *
 * Bug A — useRealtime 的 sessionKey 传错了。
 *   - RAGChat.tsx:188 `useRealtime({ sessionKey: activeId })` —— activeId 是
 *     后端数字主键(如 `"221"`),不是真 sessionKey(如 `"cs-17859...-xxx"`)。
 *   - 后端 ws/realtime.gateway.ts:76-83 用
 *     `prisma.csSession.findUnique({ where: { sessionKey } })` 查 string unique,
 *     **不收数字**;查不到直接 disconnect + 日志 `unknown sessionKey=221`。
 *   - 实测 console: "connected sessionKey= -1785978679745 / disconnected: io server
 *     disconnect / connected sessionKey= 221 / disconnected: io server disconnect"
 *   - 用户看到的就是这条 WS 风暴,误以为是 upsert 报错。
 *
 * Bug B — upsert 完成后 URL 不更新。
 *   - use-sessions.ts:236-241 setActiveId 切到 backendId,但没碰 router。
 *   - URL 停在 `/chat/-1785978679745`,刷新就脏(/chat/<负数> 不能收藏分享)。
 *
 * 修法:
 *   A) RAGChat useRealtime 的 sessionKey 改 `activeSession?.sessionKey ?? null`。
 *      use-realtime.ts:76 已有 `if (!enabled || !sessionKey) return` 短路,
 *      tempId 阶段 backendSessionId=null → enabled=false → 不连 WS(已有保护)。
 *   B) useSessions.createSession 加可选 `onCommit?: (backendId: number) => void`,
 *      upsert 成功时调 onCommit(backendId);RAGChat 在 onCommit 里 router.replace。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: createSession(opts, onCommit) — upsert 成功时调 onCommit(backendId)
 *     Given useSessions 已 hydrate, sessions = []
 *     And   onCommit spy
 *     When  createSession({ title: 'A', onCommit }) 同步触发 upsert 异步成功(返 id=221)
 *     Then  onCommit 被调,且参数 === 221
 *     And   activeId 同步切到 '221'(从 tempId → backendId)
 *
 *   Scenario 2: createSession 不传 onCommit — 不应报错
 *     Given onCommit undefined
 *     When  createSession({ title: 'A' })
 *     Then  upsert 成功 → activeId 切到 backendId,无 onCommit 调用(不抛)
 *
 *   Scenario 3: createSession upsert 失败 → onCommit 不调,activeId 保留 tempId
 *     Given upsert mock 返 status 500
 *     When  createSession({ title: 'A', onCommit })
 *     Then  onCommit 不被调
 *     And   activeId 仍 === String(tempId)(负数占位保留)
 *     And   console.warn 被调
 *
 *   Scenario 4: RAGChat useRealtime 的 sessionKey 必须是 activeSession.sessionKey
 *     Given RAGChat.tsx 源码
 *     Then  useRealtime(...) 的 sessionKey prop **不**等于 activeId
 *     And   useRealtime(...) 的 sessionKey prop === activeSession?.sessionKey ?? null
 *     (grep 验证源代码契约 — 跟 cs-round-013 同模式)
 *
 *   Scenario 5: RAGChat.send() 把 router.replace 绑到 onCommit(backendId)
 *     Given RAGChat.tsx 源码
 *     Then  createSession({ ... onCommit: (backendId) => router.replace(`/chat/${backendId}`) })
 *     (grep 验证 — 不允许 createSession 后 caller 单独再调 router.replace)
 *
 *   Scenario 6: 回归 — tempId 阶段(use-chat-state 早返)不应连 WS
 *     Given use-sessions 已 hydrate
 *     And   activeId 临时是 -17859(tempId,backendSessionId=null)
 *     When  useRealtime effect 跑
 *     Then  use-realtime.ts:76 的 `if (!enabled || !sessionKey) return` 短路:
 *           enabled=false → 不连(sessionKey 可以是 null,不应有副作用)
 *     (grep 验证 use-realtime.ts 已有 enabled 网关)
 *
 * Out of scope:
 * - SessionList 的 "unique key" warning(本次触发是历史脏数据 / cs-round-014 守卫已加)
 * - 后端 WS 网关契约(已正确,不修)
 * - upsert 失败重试(createSession 当前 fire-and-forget warn,本轮不动)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-015.spec.ts,
 *      验证 useSessions.createSession 的 onCommit 行为 + RAGChat 源码契约。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** fresh 模块加载 — withCache 单例,测试间要 reset。 */
async function freshUseSessions() {
  const mod = await import('./hooks/use-sessions');
  return mod.useSessions;
}

/** 读源文件并剥掉注释 — 跟 cs-round-013 同模式 */
function readCode(relPath: string): string {
  const text = readFileSync(resolve(PKG, relPath), 'utf-8');
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/');
    })
    .join('\n');
}

describe('cs-round-015: WS sessionKey 错传 + upsert 后 URL 不更新', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 默认 list mock + upsert mock,upsert 默认返 {id: 221} */
  function mockListAndUpsert(opts: {
    list?: Array<{ id: number; sessionKey: string; title: string; messageCount: number; updatedAt: string; startedAt: string }>;
    upsert?: { ok: boolean; id?: number; status?: number };
  } = {}) {
    return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/customer/sessions/list')) {
        return new Response(
          JSON.stringify({ code: 0, data: { sessions: opts.list ?? [] } }),
          { status: 200 },
        );
      }
      if (url.includes('/api/sessions/upsert')) {
        const ups = opts.upsert ?? { ok: true, id: 221 };
        return new Response(
          JSON.stringify(ups.ok ? { id: ups.id } : { error: 'mock fail' }),
          { status: ups.ok ? 200 : ups.status ?? 500 },
        );
      }
      return new Response('not mocked', { status: 500 });
    });
  }

  // ── Scenario 1: onCommit 在 upsert 成功时调 ──
  describe('Scenario 1: createSession(opts, onCommit) → upsert 成功时调 onCommit(backendId)', () => {
    it('Then onCommit 被调且参数 === backendId', async () => {
      mockListAndUpsert({ upsert: { ok: true, id: 221 } });
      const useSessions = await freshUseSessions();
      const onCommit = vi.fn();

      const { result } = renderHook(() => useSessions());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      let tempId = 0;
      act(() => {
        const r = result.current.createSession({ title: 'A', onCommit });
        tempId = r.tempId;
      });

      // 同步:activeId 切到 tempId(负数)
      expect(result.current.activeId).toBe(String(tempId));

      // 等异步 upsert
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Then — onCommit(221) 被调
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(221);

      // And — activeId 切到 '221'
      expect(result.current.activeId).toBe('221');
    });
  });

  // ── Scenario 2: 不传 onCommit 不报错 ──
  describe('Scenario 2: createSession 不传 onCommit → 不报错', () => {
    it('Then upsert 成功 → activeId 切到 backendId', async () => {
      mockListAndUpsert({ upsert: { ok: true, id: 222 } });
      const useSessions = await freshUseSessions();

      const { result } = renderHook(() => useSessions());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      act(() => {
        result.current.createSession({ title: 'A' });
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Then — activeId 切到 '222',无 crash
      expect(result.current.activeId).toBe('222');
    });
  });

  // ── Scenario 3: upsert 失败 → onCommit 不调,activeId 保留 tempId ──
  describe('Scenario 3: upsert 失败 → onCommit 不调', () => {
    it('Then onCommit 不被调,activeId 保留 tempId', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockListAndUpsert({ upsert: { ok: false, status: 500 } });
      const useSessions = await freshUseSessions();
      const onCommit = vi.fn();

      const { result } = renderHook(() => useSessions());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      let tempId = 0;
      act(() => {
        const r = result.current.createSession({ title: 'A', onCommit });
        tempId = r.tempId;
      });

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Then — onCommit 不被调
      expect(onCommit).not.toHaveBeenCalled();

      // And — activeId 保留 tempId(负数)
      expect(result.current.activeId).toBe(String(tempId));
      expect(Number(result.current.activeId)).toBeLessThan(0);

      // And — console.warn 被调(失败 warn)
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  // ── Scenario 4: 源码契约 — useRealtime sessionKey === activeSession?.sessionKey ──
  describe('Scenario 4: RAGChat useRealtime sessionKey 必须是 activeSession.sessionKey', () => {
    it('Then RAGChat.tsx 源码里 useRealtime 的 sessionKey prop 不等于 activeId', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      // 不允许 sessionKey: activeId(无论是裸 activeId 还是 String(activeId))
      // 注意:允许 activeId 出现在 enabled / backendSessionId / 其它用途
      expect(code, 'RAGChat 不应把 activeId 直接当 sessionKey').not.toMatch(
        /sessionKey:\s*activeId\b/,
      );
      expect(code, 'RAGChat 不应把 String(activeId) 当 sessionKey').not.toMatch(
        /sessionKey:\s*String\(\s*activeId\b/,
      );
    });

    it('Then RAGChat.tsx 源码里 useRealtime sessionKey prop 应来自 activeSession.sessionKey', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      // 允许几种等价写法:activeSession?.sessionKey ?? null / ?? activeSession.sessionKey
      expect(code, 'RAGChat 应从 activeSession 取 sessionKey').toMatch(
        /sessionKey:\s*activeSession\?\.\s*sessionKey|activeSession\.sessionKey/,
      );
    });
  });

  // ── Scenario 5: 源码契约 — createSession 调用绑 onCommit = router.replace ──
  describe('Scenario 5: RAGChat.send() 把 router.replace 绑到 onCommit', () => {
    it('Then createSession 调用含 onCommit,且 onCommit 内部 router.replace(/chat/${backendId})', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      expect(code, 'RAGChat 应给 createSession 传 onCommit').toMatch(
        /onCommit:\s*\(/,
      );
      expect(code, 'onCommit 应 router.replace 到 /chat/<backendId>').toMatch(
        /onCommit[\s\S]*?router\.replace\([^)]*\$\{backendId\}/,
      );
    });
  });

  // ── Scenario 6: 回归 — use-realtime 已有 enabled 网关 ──
  describe('Scenario 6: use-realtime 已有 enabled 网关(tempId 阶段不连 WS)', () => {
    it('Then use-realtime.ts effect 早返依赖 enabled / sessionKey', () => {
      const code = readCode('src/hooks/use-realtime.ts');
      expect(code, 'use-realtime 应短路 enabled=false 或 sessionKey 空').toMatch(
        /if\s*\(\s*!\s*enabled\s*\|\|\s*!\s*sessionKey\s*\)\s*return/,
      );
    });
  });
});