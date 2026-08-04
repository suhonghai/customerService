/**
 * @status accepted
 * @change-id cs-round-006
 *
 * cs-round-006:appendMessage role 白名单
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-006: appendMessage role 白名单 (e2e)', () => {
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

  // ── Scenario 1: 合法 role 落库成功 ─────────────────
  describe('Given: 1 个 sessionId', () => {
    const sessionKey = `e2e-cs-round-006-s1-${Date.now()}`;
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

    it.each(['user', 'assistant', 'system', 'tool'])(
      'When: appendMessage role=%s',
      async (role: string) => {
        const res = await request(app.getHttpServer())
          .post(`/api/internal/cs/sessions/${sessionId}/messages`)
          .set('X-Internal-Token', internalToken)
          .send({ role, content: `test-${role}` })
          .expect(201);

        expect(res.body.data.role).toBe(role);
      },
    );
  });

  // ── Scenario 2: 非法 role 拒绝 ─────────────────
  describe('Given: 1 个 sessionId', () => {
    const sessionKey = `e2e-cs-round-006-s2-${Date.now()}`;
    let sessionId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v2', messageCount: 0 },
      });
      sessionId = session.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it.each(['admin', 'hacker', '', 'USER', '../etc/passwd'])(
      'When: appendMessage role=%j(非法)',
      async (role: string) => {
        await request(app.getHttpServer())
          .post(`/api/internal/cs/sessions/${sessionId}/messages`)
          .set('X-Internal-Token', internalToken)
          .send({ role, content: 'should fail' })
          .expect(400);
      },
    );
  });
});
