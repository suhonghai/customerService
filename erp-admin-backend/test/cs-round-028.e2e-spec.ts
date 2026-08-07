/**
 * @status accepted
 * @change-id cs-round-028
 *
 * cs-round-028:架构层面消除 ghost 占位 race window — 不预占位,首 chunk INSERT
 *
 * Why(为什么做):
 *   ai-cs-demo BFF 之前在 streamText 启动之前(chat/route.ts:486-504)就 appendMessage
 *   一条 status=2 content='' 的 ghost 占位行。如果用户在第一个 chunk 抵达前就刷新
 *   页面,前端 refetch-history 看到这条 status=2 行(不查 content 是否空)→ 触发
 *   useAutoResumeStreaming 自动续推 → 续推落到 in-flight Map miss → 重新调 streamText
 *   → 浏览器 fetch 又断开 → 0 chunk → AI_NoOutputGeneratedError。
 *
 *   cs-round-002 reaper 5min 阈值救不了"30 秒刷新"。本 spec 架构层面消除该
 *   race window:**BFF 不再预占位,改为 streamText 第一个 chunk 抵达时才 INSERT
 *   assistant row**。
 *
 * 后端契约(本 spec 验证):
 *   - backend appendMessage / updateMessage / reaper 行为**不变**
 *   - 验证"不调 appendMessage 就 abort"路径下 reaper 不报错(没 row → 不动)
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: appendMessage 正常 → 201 + 新 id
 *     Given 1 个 session
 *     When  POST /api/internal/cs/sessions/:id/messages {role:assistant, content:'', status:2}
 *     Then  201 + data.id > 0
 *     And   DB 落库 status=2, content=''
 *
 *   Scenario 2: 多次 updateMessage 状态流转 status=2 → 1
 *     Given 1 条 assistant row(status=2)
 *     When  PATCH /api/internal/cs/sessions/:id/messages/:msgId {content:'partial', status:2}
 *     And   PATCH ... {content:'partial 已完成', status:1}
 *     Then  最终 row.status=1, content 含 '已完成'
 *
 *   Scenario 3: 不调 appendMessage 就 abort → reaper 不报错也不动
 *     Given 没有 assistant row(session 只有 user row)
 *     When  POST /api/internal/cs/reap-orphans
 *     Then  201 + data.reaped=0(本 session 没 row,reaper 不动)
 *     And   不抛错
 *
 *   Scenario 4: regression — reaper 5min 阈值路径行为不变
 *     Given 1 条 status=2 row, updated_at 推回 6 分钟前
 *     When  POST /api/internal/cs/reap-orphans
 *     Then  status=2 → status=4(回归 cs-round-002 S1)
 *
 * Out of scope:
 *   - ai-cs-demo BFF 改动(由 ai-cs-demo/src/cs-round-028.spec.ts 验证)
 *   - cs_message schema 变更(不动)
 *   - 跨包 user-visible spec(由 tests/_specs/cs-round-028.spec.ts 验证)
 *
 * 落点:erp-admin-backend/test/cs-round-028.e2e-spec.ts(jest + supertest + test DB)。
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-028: 不预占位,首 chunk INSERT(后端 e2e — appendMessage / updateMessage / reaper 行为不变)', () => {
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

  // ── Scenario 1: appendMessage 正常 → 201 + 新 id ─────────────
  describe('Scenario 1: appendMessage 第一次正常(对应 BFF 首 chunk INSERT)', () => {
    const sessionKey = `e2e-cs-round-028-s1-${Date.now()}`;
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

    it('When: POST /api/internal/cs/sessions/:id/messages {role:assistant, content:首 chunk, status:2}', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${sessionId}/messages`)
        .set('X-Internal-Token', internalToken)
        .send({
          role: 'assistant',
          content: '首 chunk 文本',
          parts: [{ type: 'text', text: '首 chunk 文本' }],
          status: 2,
        })
        .expect(201);

      // 响应必返 id
      expect(res.body.data.id).toBeGreaterThan(0);

      // DB 落库契约
      const after = await prisma.csMessage.findUnique({
        where: { id: res.body.data.id },
      });
      expect(after).not.toBeNull();
      expect(after!.role).toBe('assistant');
      expect(after!.status).toBe(2);
      expect(after!.content).toBe('首 chunk 文本');
    });
  });

  // ── Scenario 2: 多次 updateMessage 状态流转 status=2 → 1 ─────────────
  describe('Scenario 2: 多次 updateMessage 流式累积 → status=1', () => {
    const sessionKey = `e2e-cs-round-028-s2-${Date.now()}`;
    let sessionId: number;
    let messageId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v2', messageCount: 0 },
      });
      sessionId = session.id;
      const placeholder = await prisma.csMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: '',
          parts: [],
          status: 2,
        },
      });
      messageId = placeholder.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: 多次 PATCH 累积 content,最终 status=1', async () => {
      // 模拟 BFF onChunk + schedulePatch 持续 PATCH
      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({ content: 'partial 1', parts: [{ type: 'text', text: 'partial 1' }], status: 2 })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({
          content: 'partial 1 + 2',
          parts: [{ type: 'text', text: 'partial 1 + 2' }],
          status: 2,
        })
        .expect(200);

      // 流结束:onFinish flushPatch(1)
      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({
          content: 'partial 1 + 2 完成',
          parts: [{ type: 'text', text: 'partial 1 + 2 完成' }],
          status: 1,
        })
        .expect(200);

      const after = await prisma.csMessage.findUnique({ where: { id: messageId } });
      expect(after).not.toBeNull();
      expect(after!.status).toBe(1);
      expect(after!.content).toBe('partial 1 + 2 完成');
    });
  });

  // ── Scenario 3: 不调 appendMessage 就 abort → reaper 不报错也不动 ─────────
  describe('Scenario 3: 没调 appendMessage 就 abort → reaper 不报错(没 row → 不动)', () => {
    const sessionKey = `e2e-cs-round-028-s3-${Date.now()}`;
    let sessionId: number;
    let userMessageId: number;

    beforeAll(async () => {
      // 只建 1 条 user row,模拟「streamText 在首 chunk 抵达前 abort」：
      //   BFF 不预占位,所以 assistant row 从未存在。
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v3', messageCount: 0 },
      });
      sessionId = session.id;
      const userMsg = await prisma.csMessage.create({
        data: {
          sessionId,
          role: 'user',
          content: '查询订单',
          status: 1,
        },
      });
      userMessageId = userMsg.id;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: POST /api/internal/cs/reap-orphans(没 assistant row,reaper 应空跑)', async () => {
      // 验证:本 session 确实没有 assistant row
      const assistantCount = await prisma.csMessage.count({
        where: { sessionId, role: 'assistant' },
      });
      expect(assistantCount, '本 session 应无 assistant row(模拟 0 chunk abort)').toBe(0);

      // reaper 必须不报错(没 row 可 reap)
      const res = await request(app.getHttpServer())
        .post('/api/internal/cs/reap-orphans')
        .set('X-Internal-Token', internalToken)
        .expect(201);

      // 本 session 的 reaped 数应为 0(全仓可能有别的 session row 被 reap,只看本 session)
      const messageIds = (res.body.data.messageIds as number[]) ?? [];
      expect(messageIds.every((id) => id !== userMessageId)).toBe(true);
      expect(messageIds.some((id) => id >= 0 && id !== undefined)).not.toBe(
        // 兜底断言:本次 session id 不在 reap 列表
        // (其他 session 可能被 reap,但本 session 无 assistant row)
        true,
      );

      // DB 仍然只有 user row
      const after = await prisma.csMessage.count({ where: { sessionId } });
      expect(after).toBe(1);
    });
  });

  // ── Scenario 4: regression — reaper 5min 阈值路径行为不变 ─────────────
  describe('Scenario 4: regression — reaper 5min 阈值(回归 cs-round-002 S1)', () => {
    const sessionKey = `e2e-cs-round-028-s4-${Date.now()}`;
    let sessionId: number;
    let messageId: number;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v4', messageCount: 1 },
      });
      sessionId = session.id;
      // 真实场景:首 chunk INSERT 完成 → status=2 row 存在 → 但 6 分钟没继续 PATCH
      //   (LLM 慢 / 客户端 abort / 异常)。reaper 应改 status=4。
      const msg = await prisma.csMessage.create({
        data: {
          sessionId,
          role: 'assistant',
          content: '首 chunk 后卡死',
          parts: [{ type: 'text', text: '首 chunk 后卡死' }],
          status: 2,
        },
      });
      messageId = msg.id;
      await prisma.$executeRaw`
        UPDATE cs_message SET updated_at = NOW() - INTERVAL 6 MINUTE
        WHERE id = ${messageId}
      `;
    });

    afterAll(async () => {
      await prisma.csMessage.deleteMany({ where: { sessionId } });
      await prisma.csSession.deleteMany({ where: { id: sessionId } });
    });

    it('When: POST /api/internal/cs/reap-orphans(5 分钟阈值)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/internal/cs/reap-orphans')
        .set('X-Internal-Token', internalToken)
        .expect(201);

      expect((res.body.data.messageIds as number[])).toContain(messageId);

      const after = await prisma.csMessage.findUnique({ where: { id: messageId } });
      expect(after).not.toBeNull();
      // 行为不变:status 2 → 4(回归 cs-round-002 S1)
      expect(after!.status).toBe(4);
    });
  });
});