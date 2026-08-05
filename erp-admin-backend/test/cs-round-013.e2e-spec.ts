/**
 * @status implemented
 * @change-id cs-round-013
 *
 * cs-round-013:聊天数据全部从接口获取,前端不再做客户端持久化(后端 e2e)。
 *
 * Why:
 * 旧前端实现把 sessions + activeId 写 localStorage,导致 401 wipe / 跨设备状态分裂。
 * cs-round-013 砍掉所有前端持久化,sessions 100% 来自 /api/customer/sessions/list,
 * 单会话 messages 来自 /api/sessions/:id/history。
 *
 * 这个 spec 守门**后端契约**:list 接口必须返 sessionKey + messageCount 字段,
 * 否则前端 sidebar / 新建会话 / upsert 调用会全崩。
 *
 * 覆盖 2 个 Scenario:
 *  1. list 返回每条 session 都包含 sessionKey + messageCount 字段
 *  2. appendMessage 后 messageCount 同步 +1(跨接口一致性 — 前端靠这个渲染 sidebar)
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import request from 'supertest';

const sessionKeyOf = (n: number) => `e2e-cs-round-013-${n}-${Date.now()}`;

// INTERNAL_TOKEN 必须与 src/main.ts 启动配置一致(.env.test)
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? 'test-internal-token';
const AUTH_USER_HEADER = { 'X-Internal-Token': INTERNAL_TOKEN };

describe('cs-round-013: 后端契约 — list 必返 sessionKey + messageCount', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
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

  // ── Scenario 1:list 必返 sessionKey + messageCount ──
  describe('Given: 后端 cs_session 表有若干 session', () => {
    it('Then: GET /api/internal/cs/sessions 返回每条都包含 sessionKey + messageCount 字段', async () => {
      // arrange — 直接用 prisma 插 2 条 session
      const userId = 99001 + Math.floor(Math.random() * 1000);
      const k1 = sessionKeyOf(1);
      const k2 = sessionKeyOf(2);
      await prisma.csSession.create({
        data: {
          sessionKey: k1,
          visitorId: 'e2e-v1',
          userId,
          messageCount: 0,
        },
      });
      await prisma.csSession.create({
        data: {
          sessionKey: k2,
          visitorId: 'e2e-v2',
          userId,
          messageCount: 3,
        },
      });

      // act
      const res = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions?userId=${userId}`)
        .set(AUTH_USER_HEADER);

      // assert
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const sessions = res.body.data?.sessions ?? [];
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      // 每条都有 sessionKey + messageCount
      for (const s of sessions) {
        expect(typeof s.sessionKey).toBe('string');
        expect(s.sessionKey.length).toBeGreaterThan(0);
        expect(typeof s.messageCount).toBe('number');
        expect(s.messageCount).toBeGreaterThanOrEqual(0);
      }

      // k2 应是 messageCount=3
      const k2Row = sessions.find((s: { sessionKey: string }) => s.sessionKey === k2);
      expect(k2Row?.messageCount).toBe(3);

      // cleanup
      await prisma.csSession.deleteMany({ where: { userId } });
    });
  });

  // ── Scenario 2:appendMessage 后 list 的 messageCount 同步 +1 ──
  describe('Given: 已有 1 个 session(messageCount=0)', () => {
    it('Then: appendMessage 1 条后,list 看到的 messageCount=1', async () => {
      // arrange
      const userId = 99001 + Math.floor(Math.random() * 1000);
      const k = sessionKeyOf(3);
      const created = await prisma.csSession.create({
        data: {
          sessionKey: k,
          visitorId: 'e2e-v3',
          userId,
          messageCount: 0,
        },
      });

      // act — appendMessage 1 条 user message
      const appendRes = await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${created.id}/messages`)
        .set(AUTH_USER_HEADER)
        .send({
          role: 'user',
          content: 'cs-round-013 测试消息',
        });
      expect(appendRes.status).toBe(201);
      expect(appendRes.body.code).toBe(0);

      // list 应看到 messageCount=1
      const listRes = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions?userId=${userId}`)
        .set(AUTH_USER_HEADER);
      expect(listRes.status).toBe(200);
      const row = (listRes.body.data?.sessions ?? []).find(
        (s: { sessionKey: string }) => s.sessionKey === k,
      );
      expect(row).toBeDefined();
      expect(row?.messageCount).toBe(1);

      // cleanup
      await prisma.csMessage.deleteMany({ where: { sessionId: created.id } });
      await prisma.csSession.delete({ where: { id: created.id } });
    });
  });
});