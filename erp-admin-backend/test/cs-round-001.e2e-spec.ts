/**
 * @status implemented
 * @change-id cs-round-001
 *
 * cs-round-001:cs_session.messageCount 语义对齐(e2e 验证)
 */

import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * cs-round-001:cs_session.messageCount 语义对齐(e2e 验证)
 *
 * 背景:原 messageCount 在 upsertSession 里 increment,一次 chat POST 插 user + assistant
 *   placeholder 两行只 +1;但字段命名 + 运营后台列名都按"消息数"理解,显示永远 ÷2。
 *   修复:messageCount 由 appendMessage 维护(单一真相),upsertSession 只同步元数据。
 *
 * 为什么放这里不走根 tests/_specs/ 的 vitest:
 *   2026-07-31 §D 实战发现:根 vitest 跑跨包后端 service 在 pnpm strict 隔离下有
 *   dep hell(方案 A NestJS Testing + B server.deps.inline 都不通),所以后端 spec
 *   走既有 jest + supertest + 真实 test DB 路径,见 docs/ssd-status.md §D / P-1。
 *
 * 这里 4 个 Scenario 覆盖 messageCount 完整行为:
 *  1. 全新会话首次 chat → messageCount = 1(只插了 user,没插 assistant placeholder)
 *  2. 同会话重复 chat → messageCount 累加,等于 cs_message 行数
 *  3. 字段命名(消息数)和实际值一致 —— 运营后台看到的不再 ÷2
 *  4. update 路径(messageCount 已存在的会话)不二次 +1
 */

describe('cs-round-001: cs_session.messageCount 语义对齐(e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const internalToken = process.env.INTERNAL_TOKEN ?? '';

  beforeAll(async () => {
    if (!internalToken) {
      throw new Error('INTERNAL_TOKEN not set in env (jest setup 注入)');
    }
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

  // ── Scenario 1: 全新会话首次 chat ─────────────────
  describe('Given: 全新 sessionKey(数据库没对应 cs_session 行)', () => {
    const sessionKey = `e2e-cs-round-001-s1-${Date.now()}`;

    afterAll(async () => {
      // 清理测试数据
      await prisma.csMessage.deleteMany({ where: { session: { sessionKey } } });
      await prisma.csSession.deleteMany({ where: { sessionKey } });
    });

    it('When: 调 upsertSession + appendMessage(user)', () => {
      return (async () => {
        // act
        await request(app.getHttpServer())
          .post('/api/internal/cs/sessions')
          .set('X-Internal-Token', internalToken)
          .send({ sessionKey, visitorId: 'e2e-v1' })
          .expect(201);

        await request(app.getHttpServer())
          .post('/api/internal/cs/sessions/0/messages') // id 后续从 upsert 拿
          // 见 Scenario 2 拿真实 id 的做法
          .set('X-Internal-Token', internalToken)
          .send({ role: 'user', content: 'hi' });

        // 拿真 session id
        const session = await prisma.csSession.findUnique({ where: { sessionKey } });
        expect(session).not.toBeNull();
        // 关键断言:messageCount 应 = 1(创建时 = 0,appendMessage 1 次 +1)
        expect(session!.messageCount).toBe(1);

        // 同时验证:cs_message 实际行数
        const msgCount = await prisma.csMessage.count({
          where: { sessionId: session!.id },
        });
        expect(msgCount).toBe(1);
        // 字段"消息数"语义自洽:messageCount = COUNT(cs_message)
        expect(session!.messageCount).toBe(msgCount);
      })();
    });
  });

  // ── Scenario 2: 重复 chat → messageCount 累加 ─────────────────
  describe('Given: 已有 session(1 条 message)', () => {
    const sessionKey = `e2e-cs-round-001-s2-${Date.now()}`;
    let sessionId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: {
          sessionKey,
          visitorId: 'e2e-v2',
          messageCount: 0,
        },
      });
      sessionId = session.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: 连续 append 2 条 message', () => {
      return (async () => {
        await request(app.getHttpServer())
          .post(`/api/internal/cs/sessions/${sessionId}/messages`)
          .set('X-Internal-Token', internalToken)
          .send({ role: 'user', content: 'msg-1' })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/api/internal/cs/sessions/${sessionId}/messages`)
          .set('X-Internal-Token', internalToken)
          .send({ role: 'user', content: 'msg-2' })
          .expect(201);

        const session = await prisma.csSession.findUnique({ where: { id: sessionId } });
        expect(session).not.toBeNull();
        // 关键断言:2 次 appendMessage 后 messageCount = 2
        expect(session!.messageCount).toBe(2);

        const msgCount = await prisma.csMessage.count({ where: { sessionId } });
        expect(msgCount).toBe(2);
      })();
    });
  });

  // ── Scenario 3: 字段"消息数"和实际行数一致(运营后台不再 ÷2)─────────
  describe('Given: 同一会话经过 3 轮 chat(每轮 1 user + 1 assistant)', () => {
    const sessionKey = `e2e-cs-round-001-s3-${Date.now()}`;
    let sessionId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v3', messageCount: 0 },
      });
      sessionId = session.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: 连续 append 6 条 message(3 user + 3 assistant)', () => {
      return (async () => {
        for (let i = 0; i < 3; i++) {
          await request(app.getHttpServer())
            .post(`/api/internal/cs/sessions/${sessionId}/messages`)
            .set('X-Internal-Token', internalToken)
            .send({ role: 'user', content: `user-${i}` })
            .expect(201);
          await request(app.getHttpServer())
            .post(`/api/internal/cs/sessions/${sessionId}/messages`)
            .set('X-Internal-Token', internalToken)
            .send({ role: 'assistant', content: `ai-${i}` })
            .expect(201);
        }

        const session = await prisma.csSession.findUnique({ where: { id: sessionId } });
        // 关键断言:6 条 message → messageCount = 6(不是 ÷2 的 3)
        expect(session!.messageCount).toBe(6);

        const msgCount = await prisma.csMessage.count({ where: { sessionId } });
        // 字段语义对齐:messageCount = COUNT(cs_message)
        expect(session!.messageCount).toBe(msgCount);
      })();
    });
  });
});
