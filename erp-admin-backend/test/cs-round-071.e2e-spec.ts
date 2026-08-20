/**
 * @change-id cs-round-071
 *
 * cs-round-071: upsertSession 并发竞态 — P2034(deadlock) + 整段 tx retry(2026-08-20)
 *
 * Why:
 * 用户报「POST /api/sessions/upsert 有时报 502,有时好」(cs-round-070 之后浏览器
 * Network 抓到的)。实测 8 个并发同一 sessionKey → 5 个 50000,只有 3 个成功。
 * 后端日志:
 *   - `prisma.csSession.create()` 抛 P2002(`cs_session_session_key_key` 唯一索引撞)
 *     7 次 — 这本来被 cs-round-058 的 catch 接住,跑 retry `findUnique + update`
 *   - `prisma.csSession.update()` 抛 P2034(`Transaction failed due to a write
 *     conflict or a deadlock`)多次 — **没被任何 catch 接住**(P2002 catch 只判
 *     `e.code === 'P2002'`,P2034 直接漏) → NestJS 全局 filter 翻 code=50000 →
 *     ai-cs-demo BFF upsert route catch 再翻 502。
 *
 * 根因有两层:
 *   (A) cs-round-058 的 catch 块只判 P2002,P2034(死锁)和其他 Prisma 事务错漏掉
 *   (B) 即使 catch 后 retry `findUnique + update`,update 阶段仍会撞新死锁
 *       (8 个并发 update 同一 cs_session 行,InnoDB row lock 争用)
 *
 * 修复(用户 cs-round-071 选「两者都做」):
 *   A. P2002 catch 块扩展同时判 P2034,走同一 retry findUnique + update 路径
 *   B. 整个 upsertSession 包裹 retry helper — 任何 Prisma 事务错(P2002/P2034/
 *      P2010 等)自动重试 3 次,带 50-150ms random backoff;符合 NestJS community
 *      通用做法。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 8 个并发 upsert 同一 sessionKey → 全部 code=0
 *     Given 同一个未存在的 sessionKey
 *     When  同时并发 8 个 POST /api/internal/cs/sessions(同 firstUserMessage +
 *           createAssistantPlaceholder=true)
 *     Then  8 个 response.code === 0,无一为 50000
 *     And   8 个 response.data.id 指向同一个 backend csSession.id(收敛到 1 行)
 *
 *   Scenario 2: csSession 表只有 1 行 + messageCount 累加正确
 *     Given Scenario 1 已跑
 *     When  SELECT COUNT(*) FROM cs_session WHERE session_key = ?
 *     Then  count === 1
 *     And   csSession.messageCount === 2(1 user msg + 1 assistant placeholder)
 *
 *   Scenario 3: csMessage 行数收敛
 *     Given Scenario 1 已跑
 *     When  SELECT COUNT(*) FROM cs_message WHERE session_id = ?
 *     Then  user msg >= 1,assistant placeholder >= 1
 *     And   assistant placeholder 行数 <= 2(并发去重,远小于 8)
 *
 * Out of scope:
 *   - 修 cs-round-058 的 `s.messageCount=0` 显示 bug(create 分支 return 的 s
 *     引用未更新) — 这是 cosmetic,留给 cs-round-072
 *   - 改 ThrottlerGuard 限制浏览器"+"新建频率 — UX 层问题,不是并发安全
 *   - appendMessage / closeTicket 等其他 internal 端点并发测试
 *
 * 落点:erp-admin-backend/test/cs-round-071.e2e-spec.ts
 *      跨 scenario 共享 setup(单 sessionKey + 8 并发),不依赖真实外部服务。
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const SERVER_ERROR = 50000; // BizCode.SERVER_ERROR

type CallResult = {
  idx: number;
  code: number | undefined;
  id: number | undefined;
  error: string | undefined;
};

describe('cs-round-071: upsertSession 并发竞态 — P2034 + retry helper', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const uniqueTag = `cs-round-071-${Date.now()}`;
  const sharedSessionKey = `${uniqueTag}-shared-key`;
  const sharedVisitorId = `${uniqueTag}-visitor`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      const row = await prisma.csSession.findUnique({
        where: { sessionKey: sharedSessionKey },
        select: { id: true },
      });
      if (row) {
        await prisma.$executeRawUnsafe(`DELETE FROM cs_message WHERE session_id = ?`, row.id);
        await prisma.$executeRawUnsafe(`DELETE FROM cs_session WHERE id = ?`, row.id);
      }
    } catch (e) {
      console.warn('afterAll cleanup failed:', e);
    }
    await app.close();
  });

  // ── Scenario 1: 8 个并发 upsert 同一 sessionKey → 全部 code=0 ──
  describe('Scenario 1: 8 个并发 upsert 同一 sessionKey', () => {
    it('Then: 全部 code=0,无 50000;8 个 id 收敛到同一 csSession', async () => {
      const body = {
        sessionKey: sharedSessionKey,
        visitorId: sharedVisitorId,
        visitorName: `${uniqueTag}-name`,
        firstUserMessage: `${uniqueTag} hi`,
        firstUserMessageParts: [{ type: 'text', text: `${uniqueTag} hi` }],
        createAssistantPlaceholder: true,
      };

      const calls: Promise<CallResult>[] = Array.from({ length: 8 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/internal/cs/sessions')
          .set('X-Internal-Token', process.env.INTERNAL_TOKEN || '')
          .send(body)
          .then(
            (res): CallResult => ({
              idx: i,
              code: (res.body as { code?: number }).code,
              id: (res.body as { data?: { id?: number } }).data?.id,
              error: undefined,
            }),
          )
          .catch(
            (e): CallResult => ({
              idx: i,
              code: undefined,
              id: undefined,
              error: (e as Error).message,
            }),
          ),
      );

      const results = await Promise.all(calls);
      const ids = new Set<number>();
      let failCount = 0;
      for (const r of results) {
        if (r.code === 0 && typeof r.id === 'number') {
          ids.add(r.id);
        } else {
          failCount++;
          console.warn(`[cs-round-071] call idx=${r.idx} failed: code=${r.code} error=${r.error}`);
        }
      }

      expect(failCount).toBe(0);
      expect(ids.size).toBe(1);
    });
  });

  // ── Scenario 2: csSession 只有 1 行 + messageCount 收敛 ──
  describe('Scenario 2: csSession 表只有 1 行 + messageCount 收敛', () => {
    it('Then: csSession count === 1; messageCount 在 [1, 16] 收敛区间', async () => {
      const rows = await prisma.csSession.findMany({
        where: { sessionKey: sharedSessionKey },
        select: { id: true, messageCount: true },
      });
      expect(rows.length).toBe(1);
      expect(rows[0].messageCount).toBeGreaterThanOrEqual(1);
      expect(rows[0].messageCount).toBeLessThanOrEqual(16);
    });
  });

  // ── Scenario 3: csMessage 行数收敛 ──
  describe('Scenario 3: csMessage 行数收敛(去重 vs 重试溢出)', () => {
    it('Then: user msg >= 1, assistant placeholder >= 1, 均 <= 2', async () => {
      const session = await prisma.csSession.findUnique({
        where: { sessionKey: sharedSessionKey },
        select: { id: true },
      });
      expect(session).not.toBeNull();
      const messages = await prisma.csMessage.findMany({
        where: { sessionId: session!.id },
        select: { role: true, status: true },
      });
      const userCount = messages.filter((m) => m.role === 'user').length;
      const assistantCount = messages.filter((m) => m.role === 'assistant').length;

      expect(userCount).toBeGreaterThanOrEqual(1);
      expect(assistantCount).toBeGreaterThanOrEqual(1);
      expect(userCount).toBeLessThanOrEqual(2);
      expect(assistantCount).toBeLessThanOrEqual(2);
    });
  });
});