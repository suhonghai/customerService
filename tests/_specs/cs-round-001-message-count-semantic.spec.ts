/**
 * @status draft
 * @change-id cs-round-001
 *
 * cs-round-001: cs_session.messageCount 语义对齐
 *
 * 背景:原代码 messageCount 在 upsertSession 里 increment,意味着一次 chat POST(插
 *   user + assistant placeholder 两行)只 +1;但字段命名 + 运营后台列名都按"消息数"理解,
 *   显示永远 ÷2。修复:messageCount 由 appendMessage 维护(单一真相),upsertSession
 *   只同步元数据。
 *
 * Spec 设计:只测 upsertSession 的 call args(避免 mock appendMessage 的 emit 链路),
 *   appendMessage 的 +1 行为由 erp-admin-backend/test/integration-ai-cs-demo.e2e-spec.ts
 *   覆盖(那是真 DB,非 mock)。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(),
  Prisma: { InputJsonValue: class {} },
}));

import { InternalService } from '../../../erp-admin-backend/src/modules/internal/internal.service';
import type { UpsertSessionDto } from '../../../erp-admin-backend/src/modules/internal/dto/upsert-session.dto';

describe('cs-round-001: cs_session.messageCount 语义对齐', () => {
  let service: InternalService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      csSession: {
        upsert: vi.fn().mockResolvedValue({ id: 1, messageCount: 0 }),
        findUnique: vi.fn().mockResolvedValue({ id: 1 }),
        update: vi.fn(),
      },
      csMessage: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new InternalService(mockPrisma, {} as any, {} as any, {} as any, {} as any);
  });

  // ── Scenario 1: 全新会话 create 分支 ─────────────────
  describe('Given: 全新会话(没有任何 cs_session 行)', () => {
    describe('When: 调 upsertSession 第一次', () => {
      it('Then: create 分支的 messageCount = 0(由 appendMessage 来 +1)', async () => {
        await service.upsertSession({ sessionKey: 'A', visitorId: 'v' } as UpsertSessionDto);

        const upsertCall = mockPrisma.csSession.upsert.mock.calls[0][0];
        expect(upsertCall.create).toBeDefined();
        expect(upsertCall.create.messageCount).toBe(0);
      });
    });
  });

  // ── Scenario 2: 已有会话 update 分支 ─────────────────
  describe('Given: 已有 1 条 cs_message 落库(messageCount = 1)', () => {
    describe('When: 再调一次 upsertSession(同 sessionKey)', () => {
      it('Then: update 分支不传 messageCount(upsert 不再 +1)', async () => {
        // 模拟 update 分支:已存在记录
        mockPrisma.csSession.upsert.mockResolvedValue({ id: 1, messageCount: 1 });

        await service.upsertSession({ sessionKey: 'A', visitorId: 'v' } as UpsertSessionDto);

        const upsertCall = mockPrisma.csSession.upsert.mock.calls[0][0];
        // 关键断言:update 不带 messageCount 字段
        expect(upsertCall.update).not.toHaveProperty('messageCount');
      });

      it('Then: create 分支(messageCount = 0)仍然存在(Prisma upsert API 要求)', async () => {
        // Prisma upsert API 总是同时要 update + create —— 即便走 update 分支
        // 我们只断言 create.messageCount = 0 即可
        mockPrisma.csSession.upsert.mockResolvedValue({ id: 1, messageCount: 1 });

        await service.upsertSession({ sessionKey: 'A', visitorId: 'v' } as UpsertSessionDto);

        const upsertCall = mockPrisma.csSession.upsert.mock.calls[0][0];
        expect(upsertCall.create.messageCount).toBe(0);
      });
    });
  });

  // ── Scenario 3: 多 userId / customerId 同步仍然工作 ─────
  describe('Given: 已登录用户调 upsertSession(同步 userId)', () => {
    it('Then: update 分支带 userId 不带 messageCount', async () => {
      mockPrisma.csSession.upsert.mockResolvedValue({ id: 1, messageCount: 0 });

      await service.upsertSession({
        sessionKey: 'A',
        visitorId: 'v',
        userId: 42,
      } as UpsertSessionDto);

      const upsertCall = mockPrisma.csSession.upsert.mock.calls[0][0];
      expect(upsertCall.update.userId).toBe(42);
      expect(upsertCall.update).not.toHaveProperty('messageCount');
    });
  });
});
