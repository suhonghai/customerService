/**
 * @status implemented
 * @change-id cs-round-014
 *
 * cs-round-014:后端契约守卫 — listSessions 接口必须返回每条 session 的 id 字段。
 *
 * Why:
 * 前端 use-sessions.ts RemoteSession.id: number(必填),URL /chat/[sessionId] 也靠
 * 这个数字 id 跳转。修复前 select 漏掉 id,前端 s.id 是 undefined → /chat/undefined。
 *
 * 这个 spec 守门**后端契约**:list 接口必须返 id(正整数),否则前端 sidebar
 * 点击 / 路由跳转 全崩。
 *
 * 覆盖 2 个 Scenario:
 *  1. list 返回每条 session 都包含 id 字段(正整数)
 *  2. 过滤条件命中且能按 id 唯一识别的两条 session 时,id 不重复
 */

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import request from 'supertest';

const sessionKeyOf = (n: number) => `e2e-cs-round-014-${n}-${Date.now()}`;

// INTERNAL_TOKEN 必须与 src/main.ts 启动配置一致(.env.test)
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? 'test-internal-token';
const AUTH_USER_HEADER = { 'X-Internal-Token': INTERNAL_TOKEN };

describe('cs-round-014: 后端契约 — list 必返 id 字段(正整数)', () => {
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

  // ── Scenario 1:list 必返 id 字段(正整数) ──
  describe('Given: 后端 cs_session 表有若干 session', () => {
    it('Then: GET /api/internal/cs/sessions 返回每条都包含 id(正整数)', async () => {
      // arrange — 插 2 条 session(userId=null 绕 DB FK 约束,
      // 不用 userId 过滤而用 visitorId 过滤)
      const visitorId = `e2e-v-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const k1 = sessionKeyOf(1);
      const k2 = sessionKeyOf(2);
      const c1 = await prisma.csSession.create({
        data: {
          sessionKey: k1,
          visitorId,
          userId: null,
          messageCount: 0,
        },
      });
      const c2 = await prisma.csSession.create({
        data: {
          sessionKey: k2,
          visitorId,
          userId: null,
          messageCount: 3,
        },
      });

      // act — list 按 visitorId 过滤
      const res = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions?visitorId=${visitorId}`)
        .set(AUTH_USER_HEADER);

      // assert
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      const sessions = (res.body.data?.sessions ?? []) as Array<{
        id?: unknown;
        sessionKey: string;
        messageCount: number;
      }>;
      expect(sessions.length).toBeGreaterThanOrEqual(2);

      // 每条都有 id:number 且正整数
      for (const s of sessions) {
        expect(typeof s.id).toBe('number');
        expect(Number.isInteger(s.id as number)).toBe(true);
        expect(s.id as number).toBeGreaterThan(0);
      }

      // 用 sessionKey 反查,id 必须等于 prisma create 时返回的真 id
      const r1 = sessions.find((s) => s.sessionKey === k1);
      const r2 = sessions.find((s) => s.sessionKey === k2);
      expect(r1?.id).toBe(c1.id);
      expect(r2?.id).toBe(c2.id);

      // cleanup
      await prisma.csSession.deleteMany({ where: { visitorId } });
    });
  });

  // ── Scenario 2:同 visitorId 下两条 session 的 id 不重复 ──
  describe('Given: 同 visitorId 下有 2 条 session', () => {
    it('Then: list 返回的 id 各不相同且都能在 cs_session 表查到', async () => {
      // arrange
      const visitorId = `e2e-v2-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const k1 = sessionKeyOf(1);
      const k2 = sessionKeyOf(2);
      const c1 = await prisma.csSession.create({
        data: {
          sessionKey: k1,
          visitorId,
          userId: null,
          messageCount: 1,
        },
      });
      const c2 = await prisma.csSession.create({
        data: {
          sessionKey: k2,
          visitorId,
          userId: null,
          messageCount: 2,
        },
      });

      // act
      const res = await request(app.getHttpServer())
        .get(`/api/internal/cs/sessions?visitorId=${visitorId}`)
        .set(AUTH_USER_HEADER);
      expect(res.status).toBe(200);
      const sessions = (res.body.data?.sessions ?? []) as Array<{
        id?: unknown;
        sessionKey: string;
      }>;

      // assert — id 各不相同
      const ids = sessions.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);

      // 用 id 能在 cs_session 表查到对应 sessionKey
      const r1 = await prisma.csSession.findUnique({ where: { id: c1.id } });
      const r2 = await prisma.csSession.findUnique({ where: { id: c2.id } });
      expect(r1?.sessionKey).toBe(k1);
      expect(r2?.sessionKey).toBe(k2);

      // cleanup
      await prisma.csSession.deleteMany({ where: { visitorId } });
    });
  });
});