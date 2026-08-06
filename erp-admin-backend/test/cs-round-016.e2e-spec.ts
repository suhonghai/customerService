/**
 * @status draft
 * @change-id cs-round-016
 *
 * cs-round-016:删会话后,history 接口对已软删 sessionId 应返 404 + BizCode.NOT_FOUND,
 * 不应再 502。BFF 翻成 404 后,前端 useChatState 拿 4xx 走降级路径(welcome + warning),
 * 而不是 console 暴力报错。
 *
 * Why:
 * 用户报「ai 客服系统会话列表点击删除后,这个接口报错」+ curl 抓
 *   /api/sessions/1785978383161/history → 502
 * 实际场景:用户 stale URL /chat/<deleted-id> 进入,history 拉不到 → 后端抛 BizException
 * → BFF 把任何业务错都翻 502。前端 useChatState 拿到 502 没降级,用户侧 history 接口
 * 报错。
 *
 * 这个 spec 守门**后端契约**:已软删的 sessionId 必须返 404(精确业务码),不能被吞成 502
 * 这种"伪宕机"语义。
 *
 * 覆盖 2 个 Scenario:
 *  1. 软删后 GET /api/internal/cs/sessions/<id>/messages → 业务码 1404 (NOT_FOUND),
 *     HTTP 200(业务异常仍 200)+ message 含"会话不存在"
 *  2. 从未存在过的 sessionId → 同样 404,不应返 200 + 0 messages
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import request from 'supertest';
import { BizCode } from '../src/common/exceptions/biz.exception';

const sessionKeyOf = (n: number) => `e2e-cs-round-016-${n}-${Date.now()}`;

const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? 'test-internal-token';
const AUTH_USER_HEADER = { 'X-Internal-Token': INTERNAL_TOKEN };

describe('cs-round-016: 软删后 history 接口必返 404 + BizCode.NOT_FOUND', () => {
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

  // ── Scenario 1:软删后 getMessages 返 BizCode.NOT_FOUND(不再 BIZ_ERROR) ──
  describe('Given: 某 session 已被软删(cs_session.deletedAt 已设)', () => {
    it('Then: GET /api/internal/cs/sessions/<id>/messages 返 code=BizCode.NOT_FOUND(1404),message 含"会话不存在"', async () => {
      // arrange — 创建一个 session 然后软删
      const visitorId = `e2e-v-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const k = sessionKeyOf(1);
      const created = await prisma.csSession.create({
        data: { sessionKey: k, visitorId, userId: null, messageCount: 0 },
      });
      // 软删(direct — 模拟 "deleteSession 已跑过"):use $transaction 跟 controller.remove 同语义
      await prisma.csSession.update({
        where: { id: created.id },
        data: { deletedAt: new Date() },
      });

      // act — 拉一个已软删的 session 的 messages
      const res = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions/${created.id}/messages`)
        .set(AUTH_USER_HEADER);

      // assert — 业务码 1404(不是 40002 BIZ_ERROR),HTTP 200(BizException 标准)
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(BizCode.NOT_FOUND);
      expect(typeof res.body.message).toBe('string');
      expect(res.body.message).toMatch(/会话不存在|已删除/);

      // cleanup
      await prisma.csSession.deleteMany({ where: { visitorId } });
    });
  });

  // ── Scenario 2:从未存在过的 sessionId 同样 404,不能返 200 + 0 messages ──
  describe('Given: 一个从未存在过的 sessionId', () => {
    it('Then: GET 会话 messages 返 code=BizCode.NOT_FOUND(不是 200 + 空 messages)', async () => {
      // arrange — 选一个肯定不存在的 id(max + 1)
      const max = await prisma.csSession.findFirst({ orderBy: { id: 'desc' } });
      const nonExistId = (max?.id ?? 0) + 999999;

      // act
      const res = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions/${nonExistId}/messages`)
        .set(AUTH_USER_HEADER);

      // assert — 必须是 404 业务码,不是 200 + 空 array(那样 ajax 以为是空会话)
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(BizCode.NOT_FOUND);
      expect(res.body.message).toMatch(/会话不存在|已删除/);
    });
  });
});
