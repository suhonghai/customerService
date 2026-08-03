/**
 * @status implemented
 * @change-id cs-round-002
 *
 * (注:本 spec 需 test DB + .env.test 才能跑;CI pr-e2e.yml 跑;本地跳过)
 *
 * cs-round-002:assistant placeholder 孤儿收敛(reaper)
 *
 * 背景:chat 流式期间,appendMessage 创建 assistant placeholder(status=2 streaming)。
 *   如果流在 onFinish/onAbort/onError 之前被中断(POD SIGKILL / maxDuration=60s
 *   hard-kill / MCP 子进程崩 / streamText 内部 throw),这条 placeholder 永远停在
 *   status=2。前端 refetch 时把它当 interrupted 渲染,触发 auto-retry,白白消耗 LLM
 *   配额。修法:reaper 兜底,扫陈旧的 status=2 行,PATCH status=4 (error),emit
 *   WS 事件让前端显示错误。
 *
 * 触发策略:
 *  - 被动:每次 upsertSession 成功后 fire-and-forget 调一次
 *  - 主动:cron(本方案不强制,留 hook)
 *
 * 阈值:5 分钟(远大于 maxDuration=60s,不会误杀正在生成的流)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-002: assistant placeholder 孤儿收敛 (reaper)', () => {
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

  // ── Scenario 1: 手动 reap-orphans endpoint 收敛陈旧 status=2 行 ─
  describe('Given: 1 条 cs_message (status=2, updated_at 6 分钟前)', () => {
    const sessionKey = `e2e-cs-round-002-s1-${Date.now()}`;
    let sessionId: number;
    let messageId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v1', messageCount: 1 },
      });
      sessionId = session.id;
      const msg = await prisma.csMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: '',
          status: 2, // streaming 状态
        },
      });
      messageId = msg.id;
      // 把 updated_at 推回到 6 分钟前(模拟"卡死的 streaming")
      await prisma.$executeRaw`
        UPDATE cs_message SET updated_at = NOW() - INTERVAL 6 MINUTE
        WHERE id = ${messageId}
      `;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: POST /api/internal/cs/reap-orphans', () => {
      return (async () => {
        const res = await request(app.getHttpServer())
          .post('/api/internal/cs/reap-orphans')
          .set('X-Internal-Token', internalToken)
          .expect(201);

        // 响应报收敛数
        expect(res.body.data.reaped).toBeGreaterThanOrEqual(1);

        // 关键断言:消息 status 从 2 → 4 (error)
        const after = await prisma.csMessage.findUnique({ where: { id: messageId } });
        expect(after).not.toBeNull();
        expect(after!.status).toBe(4);
      })();
    });
  });

  // ── Scenario 2: 健康流(刚更新)不被 reaper 误杀 ─────────────
  describe('Given: 1 条 cs_message (status=2, updated_at 30 秒前)', () => {
    const sessionKey = `e2e-cs-round-002-s2-${Date.now()}`;
    let sessionId: number;
    let messageId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v2', messageCount: 1 },
      });
      sessionId = session.id;
      const msg = await prisma.csMessage.create({
        data: { sessionId, role: 'assistant', content: '', status: 2 },
      });
      messageId = msg.id;
      // updated_at 默认 now()(不人为回退,代表正在 streaming)
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: POST /api/internal/cs/reap-orphans(5 分钟阈值)', () => {
      return (async () => {
        const res = await request(app.getHttpServer())
          .post('/api/internal/cs/reap-orphans')
          .set('X-Internal-Token', internalToken)
          .expect(201);

        // 阈值默认 5 分钟,刚更新 30 秒的不应被 reap
        const after = await prisma.csMessage.findUnique({ where: { id: messageId } });
        expect(after!.status).toBe(2);
        // response 不应包含这条
        const ids = res.body.data.messageIds as number[];
        expect(ids).not.toContain(messageId);
      })();
    });
  });

  // ── Scenario 3: 被动触发(upsertSession 触发 fire-and-forget reap) ─
  describe('Given: 1 条陈旧 status=2 + 1 个新 sessionKey', () => {
    const oldKey = `e2e-cs-round-002-s3-old-${Date.now()}`;
    const newKey = `e2e-cs-round-002-s3-new-${Date.now()}`;
    let oldMessageId: number;

    beforeAll(async () => {
      const oldSession = await prisma.csSession.upsert({
        where: { sessionKey: oldKey },
        update: {},
        create: { sessionKey: oldKey, visitorId: 'e2e-v3', messageCount: 1 },
      });
      const oldMsg = await prisma.csMessage.create({
        data: { sessionId: oldSession.id, role: 'assistant', content: '', status: 2 },
      });
      oldMessageId = oldMsg.id;
      await prisma.$executeRaw`
        UPDATE cs_message SET updated_at = NOW() - INTERVAL 10 MINUTE
        WHERE id = ${oldMessageId}
      `;
    });

    afterAll(async () => {
      // clean up old + new sessions
      const oldSession = await prisma.csSession.findUnique({ where: { sessionKey: oldKey } });
      const newSession = await prisma.csSession.findUnique({ where: { sessionKey: newKey } });
      if (oldSession) await prisma.csMessage.deleteMany({ where: { sessionId: oldSession.id } });
      if (newSession) await prisma.csMessage.deleteMany({ where: { sessionId: newSession.id } });
      if (oldSession) await prisma.csSession.deleteMany({ where: { id: oldSession.id } });
      if (newSession) await prisma.csSession.deleteMany({ where: { id: newSession.id } });
    });

    it('When: POST /api/internal/cs/sessions(新 sessionKey),passive reap 触发', () => {
      return (async () => {
        // 给 fire-and-forget 留个 buffer
        await new Promise((r) => setTimeout(r, 200));

        await request(app.getHttpServer())
          .post('/api/internal/cs/sessions')
          .set('X-Internal-Token', internalToken)
          .send({ sessionKey: newKey, visitorId: 'e2e-v3' })
          .expect(201);

        // 被动 reap 跑完(200ms 应该够 fire-and-forget 跑完)
        await new Promise((r) => setTimeout(r, 500));

        const after = await prisma.csMessage.findUnique({ where: { id: oldMessageId } });
        // 关键断言:旧 session 的陈旧 status=2 被 reap 成 4
        expect(after!.status).toBe(4);
      })();
    });
  });
});
