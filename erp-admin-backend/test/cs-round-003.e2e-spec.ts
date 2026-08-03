/**
 * @status implemented
 * @change-id cs-round-003
 *
 * cs-round-003:handoff ack 落库(跨包)
 *
 * 背景:转人工后,chat route 在 handoff 分支返回一条合成的"运营正在处理" ack 给
 *   前端 useChat,但这条 ack **不落库**(纯前端内存)。用户刷新后 ack 消失,
 *   体验上"凭空消失"。修法:ack 落库为 cs_message(role=assistant, status=1),
 *   与真人 reply 共用 cs_message 渠道,refetch 跟 history 都能拉到。
 *
 * 工具支撑:跨包 spec,核心是后端 appendMessage + 前端 chat route 行为,
 *   jest e2e 走真实 test DB 验证 cs_message 落库 + metadata 标记。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-003: handoff ack 落库 (e2e)', () => {
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

  // ── Scenario 1: 直接 appendMessage 一条 handoff ack,落库验证 ─────
  describe('Given: 1 个会话 + 1 个 open ticket', () => {
    const sessionKey = `e2e-cs-round-003-s1-${Date.now()}`;
    let sessionId: number;
    let ticketId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v1', messageCount: 0 },
      });
      sessionId = session.id;
      const ticket = await prisma.csTicket.create({
        data: {
          ticketNo: `T-${Date.now()}`,
          title: 'handoff test',
          content: 'test',
          priority: 1,
          status: 1, // 待领取
          creatorId: 1,
          sessionId,
        },
      });
      ticketId = ticket.id;
    });

    afterAll(async () => {
      await prisma.csTicket.deleteMany({ where: { id: ticketId } });
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: 直接调 erp.appendMessage 一条 system-ack(模拟 chat route 行为)', () => {
      return (async () => {
        // 模拟 chat route.ts 即将做的改动:appendMessage 一条 assistant ack
        const ackText = '运营正在处理您的消息,请稍候。';
        const created = await request(app.getHttpServer())
          .post(`/api/internal/cs/sessions/${sessionId}/messages`)
          .set('X-Internal-Token', internalToken)
          .send({
            role: 'assistant',
            content: ackText,
            status: 1,
            metadata: { source: 'system-ack', reason: 'human-handoff', ticketId },
          })
          .expect(201);

        // 关键断言 1:消息落库
        const msgId = created.body.data.id;
        const after = await prisma.csMessage.findUnique({ where: { id: msgId } });
        expect(after).not.toBeNull();
        expect(after!.role).toBe('assistant');
        expect(after!.content).toBe(ackText);
        expect(after!.status).toBe(1); // 正常落库(不是 2 streaming)
        // 关键断言 2:metadata 标记 handoff 来源(便于 frontend 区分真人 vs 系统)
        expect(after!.metadata).toMatchObject({
          source: 'system-ack',
          reason: 'human-handoff',
        });

        // 关键断言 3:session 的 messageCount +1(appendMessage 内部维护)
        const session = await prisma.csSession.findUnique({ where: { id: sessionId } });
        expect(session!.messageCount).toBe(1);
      })();
    });
  });
});
