/**
 * @status accepted
 * @change-id cs-round-005
 *
 * cs-round-005:按 sessionKey 软删(no-op 友好)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-005: 按 sessionKey 软删 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const internalToken = process.env.INTERNAL_TOKEN ?? '';

  beforeAll(async () => {
    if (!internalToken) throw new Error('INTERNAL_TOKEN not set');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Scenario 1: 命中 → 软删 ─────────────────────
  describe('Given: 存在 sessionKey A', () => {
    const sessionKey = `e2e-cs-round-005-s1-${Date.now()}`;
    let sessionId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v1', messageCount: 0 },
      });
      sessionId = session.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: DELETE /api/internal/cs/sessions/by-key/{key}', () => {
      return (async () => {
        const res = await request(app.getHttpServer())
          .delete(`/api/internal/cs/sessions/by-key/${sessionKey}`)
          .set('X-Internal-Token', internalToken)
          .expect(200);

        expect(res.body.data.deleted).toBe(true);
        expect(res.body.data.id).toBe(sessionId);

        // 关键断言:deletedAt 被设置
        const after = await prisma.csSession.findUnique({ where: { id: sessionId } });
        expect(after!.deletedAt).not.toBeNull();
      })();
    });
  });

  // ── Scenario 2: 不存在 → no-op(不报错,不创建空记录) ─────
  describe('Given: 不存在的 sessionKey', () => {
    it('When: DELETE /api/internal/cs/sessions/by-key/{不存在的}', () => {
      return (async () => {
        const fakeKey = `e2e-cs-round-005-s2-nonexistent-${Date.now()}`;
        const res = await request(app.getHttpServer())
          .delete(`/api/internal/cs/sessions/by-key/${fakeKey}`)
          .set('X-Internal-Token', internalToken)
          .expect(200);

        expect(res.body.data.deleted).toBe(false);
        expect(res.body.data.id).toBeNull();

        // 关键断言:no-op 后 DB 里没创建空 session
        const after = await prisma.csSession.findUnique({ where: { sessionKey: fakeKey } });
        expect(after).toBeNull();
      })();
    });
  });
});
