/**
 * @status draft
 * @change-id cs-round-010
 *
 * cs-round-010:点 "+ 新会话" → 懒创建(draft → 真建只在首条消息发出时)
 *
 * Why(为什么做):
 * 用户反馈当前 UX 不合理 — 点 "+ 新会话" 立刻在左侧出现一条"新会话"占位,
 * 用户还没说话就已经创建了。后端 cs_session 表也会立刻多一行空记录,
 * 等用户真发消息后才填内容。
 *
 * 期望 UX:
 * - 点 "+ 新会话" → 仅清空右侧,展示"您好我是小服"欢迎页;
 *   左侧列表条目数不变(无新条目),URL 回 `/`,不发后端请求。
 * - 用户在 draft 态输入首条消息并发送 → 才真正创建 session:
 *   - 后端 POST /api/sessions/upsert 带 title(由首条消息文本派生,经 sanitize)
 *   - 左侧列表插入新会话(置顶,title = 派生后的文本)
 *   - activeId 切到新 session,URL 跳到 /chat/<id>
 *   - 走原 send 流程(stream assistant 等)
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1:点 "+ 新会话" → draft 态,不创建不插列表不发后端
 *     Given useSessions 已 hydrate,localStorage 已有会话 [s_old],activeId=s_old
 *     When  点击 "+ 新会话"(调用 enterDraft())
 *     Then  activeId === null
 *     And   sessions 列表 === [s_old](长度与条数不变)
 *     And   无 POST /api/sessions/upsert 调用
 *     And   无 POST /api/internal/cs/sessions 调用
 *
 *   Scenario 2:draft 态再点 "+ 新会话" → no-op
 *     Given activeId === null(已是 draft)
 *     When  再调 enterDraft()
 *     Then  activeId 仍 === null
 *     And   sessions 列表不变
 *     And   无后端调用
 *
 *   Scenario 3:draft 态发首条消息 → 创建并插入列表,title 由首条消息派生
 *     Given activeId === null(刚点 + 的 draft),消息文本 "查一下我的订单"
 *     When  触发首条消息发送(createSession({ title: deriveTitleFromMessage(msg) }))
 *     Then  新 session 出现在 sessions 列表顶部
 *     And   新 session.title === "查一下我的订单"
 *     And   新 session.id 是 nanoid(10)
 *     And   activeId === 新 session.id
 *
 *   Scenario 4:deriveTitleFromMessage — 边界
 *     Given 一条 user 消息文本 "  查一下   我的   订单  "(含多余空白)
 *     When  deriveTitleFromMessage(msg)
 *     Then  返回 "查一下 我的 订单"(sanitizeTitle 折叠空白)
 *     Given 一条 user 消息文本长度 > 30 字
 *     When  deriveTitleFromMessage(msg)
 *     Then  返回前 30 字 + "..."
 *     Given 一条 user 消息文本含 PII(手机号)
 *     When  deriveTitleFromMessage(msg)
 *     Then  返回的手机号被脱敏(sanitizeTitle 行为)
 *     Given 一条 user 消息文本为空 / 仅空白
 *     When  deriveTitleFromMessage(msg)
 *     Then  返回 DEFAULT_TITLE '新会话'
 *
 * Out of scope:
 * - 后端契约变更(title 字段已支持,无需改 backend)
 * - 多端同步 / 跨设备 draft 共享(暂不实现)
 * - 网络失败降级:首条消息发出去时 upsert 失败的处理(暂保持 fire-and-forget)
 * - localStorage 草稿持久化(draft 状态不进 localStorage,刷新即丢 — 与现状一致)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-010.spec.ts,
 *      验证 useSessions 新增的 enterDraft / createSession(opts) / deriveTitleFromMessage
 *      三个接口的外部行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { deriveTitleFromMessage } from './hooks/use-sessions';

async function freshUseSessions() {
  const mod = await import('./hooks/use-sessions');
  return mod.useSessions;
}

/**
 * cs-round-013 更新:不再 seed localStorage。useSessions 数据来自后端 list 接口。
 * fetch mock 按 URL 分发:list → sessions 数组,upsert → backendId。
 */

describe('cs-round-010: 点 + 新会话 → 懒创建', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    // cs-round-013:withCache 包住 fetchRemoteSessions(module-level 单例);
    // 测试间重置模块,否则后续测试拿到首次调用的 cached promise。
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 默认 fetch mock:list 返 1 个旧会话 + 不 upsert
  function mockListOnly(sessions: Array<{ id: number; sessionKey: string; title: string; messageCount: number; updatedAt: string; startedAt: string }> = []) {
    return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/customer/sessions/list')) {
        return new Response(
          JSON.stringify({ code: 0, data: { sessions } }),
          { status: 200 },
        );
      }
      // upsert 默认返一个新 backendId=999(测试里通常不期望被调)
      if (url.includes('/api/sessions/upsert')) {
        return new Response(JSON.stringify({ id: 999 }), { status: 200 });
      }
      return new Response('not mocked', { status: 500 });
    });
  }

  const SAMPLE_OLD = [
    {
      id: 1,
      sessionKey: 'cs-old-1',
      title: '已有会话',
      messageCount: 2,
      updatedAt: new Date().toISOString(),
      startedAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
  ];

  // ── Scenario 1:点 + → draft,不创建不插列表不发后端 ──
  describe('Given list 已返 [s_old(1)],activeId=1', () => {
    describe('When enterDraft() 被调(等价点 + 新会话)', () => {
      it('Then activeId 变 null,sessions 列表不变,无后端 upsert 调用', async () => {
        // Given
        mockListOnly(SAMPLE_OLD);

        const useSessions = await freshUseSessions();
        const { result } = renderHook(() => useSessions());
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });

        // 直接 enterDraft(URL 路径效果)
        act(() => {
          result.current.enterDraft();
        });

        // Then — activeId 为 null
        expect(result.current.activeId).toBeNull();

        // And — sessions 列表条目数与内容不变
        expect(result.current.sessions.map((s) => s.id)).toEqual([1]);

        // And — 不调 upsert(POST /api/sessions/upsert)
        const fetchSpy = vi.spyOn(global, 'fetch');
        act(() => {
          result.current.enterDraft();
        });
        const upsertCalls = fetchSpy.mock.calls.filter((c) => {
          const url = String(c[0]);
          return url.includes('/api/sessions/upsert');
        });
        expect(upsertCalls, 'draft 进入不应触发 upsert').toHaveLength(0);
      });
    });
  });

  // ── Scenario 2:draft 再点 + → no-op ──
  describe('Given activeId === null(已是 draft)', () => {
    describe('When enterDraft() 再调一次', () => {
      it('Then 仍 draft,sessions 不变,无后端调用', async () => {
        // Given — 直接进 draft,无任何会话
        mockListOnly([]);

        const useSessions = await freshUseSessions();
        const { result } = renderHook(() => useSessions());
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });

        // 第一次 enterDraft
        act(() => {
          result.current.enterDraft();
        });
        expect(result.current.activeId).toBeNull();

        // When — 第二次 enterDraft
        act(() => {
          result.current.enterDraft();
        });

        // Then
        expect(result.current.activeId).toBeNull();
        expect(result.current.sessions).toHaveLength(0);
      });
    });
  });

  // ── Scenario 3:draft 态首条消息 → 真创建,title 派生 ──
  describe('Given draft(activeId=null),首条消息文本 "查一下我的订单"', () => {
    describe('When createSession({ title }) 被调', () => {
      it('Then 新 session 出现在 sessions 列表顶部,title 等于派生文本,activeId 切到新 id', async () => {
        // Given
        mockListOnly([]);

        const useSessions = await freshUseSessions();
        const { result } = renderHook(() => useSessions());
        await act(async () => {
          await new Promise((r) => setTimeout(r, 20));
        });

        act(() => {
          result.current.enterDraft();
        });

        // When — 首条消息触发真创建(同步 setActiveId(tempId),后端异步替换)
        let newId = '';
        act(() => {
          const r = result.current.createSession({ title: '查一下我的订单' });
          newId = String(r.tempId);
        });

        // Then — 同步:新 session 在列表顶部,tempId 是负数
        expect(result.current.sessions).toHaveLength(1);
        expect(result.current.sessions[0].id).toBe(Number(newId));
        expect(result.current.sessions[0].title).toBe('查一下我的订单');
        expect(Number(newId)).toBeLessThan(0); // tempId 负数

        // And — activeId 切到新 tempId
        expect(result.current.activeId).toBe(newId);

        // And — 等异步 upsert 完成
        await act(async () => {
          await new Promise((r) => setTimeout(r, 50));
        });
        expect(result.current.activeId).toBe('999'); // backendId
        expect(result.current.sessions[0].id).toBe(999);
      });
    });
  });

  // ── Scenario 4:deriveTitleFromMessage 边界 ──
  describe('deriveTitleFromMessage — 派生规则', () => {
    it('Then 折叠多余空白', () => {
      const title = deriveTitleFromMessage({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '  查一下   我的   订单  ' }],
      } as unknown as Parameters<typeof deriveTitleFromMessage>[0]);
      expect(title).toBe('查一下 我的 订单');
    });

    it('Then 超过 30 字截断 + "..."', () => {
      const long =
        '这是一段非常非常非常非常非常非常非常非常非常非常非常非常非常长的消息用来测试截断';
      const title = deriveTitleFromMessage({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: long }],
      } as unknown as Parameters<typeof deriveTitleFromMessage>[0]);
      expect(title.length).toBeLessThanOrEqual(33); // 30 + "..." = 33
      expect(title.endsWith('...')).toBe(true);
    });

    it('Then PII(手机号)被脱敏 — 继承 sanitizeTitle 行为', () => {
      const title = deriveTitleFromMessage({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '我的手机 13800138000 怎么办' }],
      } as unknown as Parameters<typeof deriveTitleFromMessage>[0]);
      expect(title).not.toContain('13800138000');
      expect(title).toContain('[手机号]');
    });

    it('Then 纯空白 → 退回 DEFAULT_TITLE "新会话"', () => {
      const title = deriveTitleFromMessage({
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: '     ' }],
      } as unknown as Parameters<typeof deriveTitleFromMessage>[0]);
      expect(title).toBe('新会话');
    });
  });
});
