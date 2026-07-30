import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

interface ApiResp<T> {
  code: number;
  message: string;
  data: T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Internal API (e2e) — Day 9', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const internalToken = process.env.INTERNAL_TOKEN ?? '';

  beforeAll(async () => {
    if (!internalToken) {
      throw new Error('INTERNAL_TOKEN not set in env — set in .env before e2e');
    }
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
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new HttpExceptionFilter(),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    // 拿 admin token(用于文件下载 + dict 路由验证)
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' })
      .expect(200);
    adminToken = (loginRes.body as ApiResp<{ accessToken: string }>).data
      .accessToken;

    // 准备一个测试用 session(给 appendMessage 用)
  });

  afterAll(async () => {
    // 清理测试 sessions / messages(只清带 prefix 的)
    await prisma.csMessage.deleteMany({
      where: { session: { sessionKey: { startsWith: 'test-int-' } } },
    });
    await prisma.csSession.deleteMany({
      where: { sessionKey: { startsWith: 'test-int-' } },
    });
    // 测试工单
    await prisma.csTicketLog.deleteMany({
      where: { ticket: { title: { startsWith: 'Day 9 集成测试' } } },
    });
    await prisma.csTicket.deleteMany({
      where: { title: { startsWith: 'Day 9 集成测试' } },
    });
    await app.close();
  });

  // ============================================================
  // 鉴权
  // ============================================================

  it('1) GET /api/internal/cs/ai-config/active 无 token → 10003', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/ai-config/active')
      .expect(200);
    expect(res.body.code).toBe(10003);
  });

  it('2) GET /api/internal/cs/ai-config/active 错 token → 10003', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/ai-config/active')
      .set('X-Internal-Token', 'wrong-token-here')
      .expect(200);
    expect(res.body.code).toBe(10003);
  });

  it('3) GET /api/internal/cs/ai-config/active 有 token → 明文 apiKey', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/ai-config/active')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as ApiResp<{
      code: string;
      modelId: string;
      apiKey: string;
    }>;
    expect(body.code).toBe(0);
    expect(body.data.modelId).toBe('qwen3.7-plus');
    // 明文 apiKey,长度应该 > 30
    expect(typeof body.data.apiKey).toBe('string');
    expect(body.data.apiKey.length).toBeGreaterThan(30);
  });

  // ============================================================
  // FAQ search
  // ============================================================

  it('4) GET /api/internal/cs/faq/search 空 q → chunks.length=0', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/faq/search?q=')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as ApiResp<{ chunks: unknown[]; total: number }>;
    expect(body.code).toBe(0);
    expect(body.data.chunks.length).toBe(0);
    expect(body.data.total).toBe(0);
  });

  it('5) GET /api/internal/cs/faq/search?q=xxx → 返结构(可能 0 chunks)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/faq/search?q=test&topK=3')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as ApiResp<{
      chunks: Array<{ content: string; metadata: Record<string, unknown>; distance: number | null }>;
      total: number;
    }>;
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data.chunks)).toBe(true);
    expect(body.data.total).toBe(body.data.chunks.length);
    // 如果有结果,验结构
    if (body.data.chunks.length > 0) {
      expect(body.data.chunks[0].content).toBeTruthy();
      expect(typeof body.data.chunks[0].distance).toBe('number');
    }
  });

  // ============================================================
  // Session upsert
  // ============================================================

  it('6) POST /api/internal/cs/sessions upsert 同 key 两次 → id 相同 + count 增加', async () => {
    const key = `test-int-upsert-${Date.now()}`;
    const res1 = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({
        sessionKey: key,
        visitorId: 'v-upsert',
        visitorName: '测试访客',
        aiModelCode: 'qwen3.7-plus',
      })
      .expect(201);
    const body1 = res1.body as ApiResp<{ id: number; messageCount: number }>;
    expect(body1.code).toBe(0);
    expect(body1.data.messageCount).toBe(1);

    const res2 = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({
        sessionKey: key,
        visitorId: 'v-upsert',
      })
      .expect(201);
    const body2 = res2.body as ApiResp<{ id: number; messageCount: number }>;
    expect(body2.data.id).toBe(body1.data.id);
    expect(body2.data.messageCount).toBe(2);
  });

  // ============================================================
  // Append messages
  // ============================================================

  it('7) POST /api/internal/cs/sessions/:id/messages 加 5 条 → DB 计数 5', async () => {
    // 先建一个 session
    const sessionKey = `test-int-msg-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId: 'v-msg' })
      .expect(201);
    const sessionId = (createRes.body as ApiResp<{ id: number }>).data.id;

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${sessionId}/messages`)
        .set('X-Internal-Token', internalToken)
        .send({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `消息 ${i + 1}`,
        })
        .expect(201);
    }
    const count = await prisma.csMessage.count({ where: { sessionId } });
    expect(count).toBe(5);
  });

  it('8) POST .../messages role=invalid → 400', async () => {
    const sessionKey = `test-int-invalid-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId: 'v-invalid' })
      .expect(201);
    const sessionId = (createRes.body as ApiResp<{ id: number }>).data.id;

    await request(app.getHttpServer())
      .post(`/api/internal/cs/sessions/${sessionId}/messages`)
      .set('X-Internal-Token', internalToken)
      .send({ role: 'robot', content: 'x' })
      .expect(400);
  });

  // ============================================================
  // GET messages (刷新恢复)
  // ============================================================

  it('8a) GET .../messages 返该 session 所有 messages(按 id ASC)', async () => {
    const sessionKey = `test-int-getmsg-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId: 'v-getmsg' })
      .expect(201);
    const sessionId = (createRes.body as ApiResp<{ id: number }>).data.id;

    // 加 3 条
    const insertedIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${sessionId}/messages`)
        .set('X-Internal-Token', internalToken)
        .send({ role: 'user', content: `get-msg ${i}` })
        .expect(201);
      insertedIds.push((r.body as ApiResp<{ id: number }>).data.id);
    }

    // GET 拉
    const res = await request(app.getHttpServer())
      .get(`/api/internal/cs/sessions/${sessionId}/messages`)
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as ApiResp<{
      messages: Array<{
        id: number;
        role: string;
        content: string;
        status: number;
        createdAt: string;
      }>;
    }>;
    expect(body.code).toBe(0);
    expect(body.data.messages.length).toBe(3);
    // 按 id ASC
    expect(body.data.messages[0].id).toBe(insertedIds[0]);
    expect(body.data.messages[2].id).toBe(insertedIds[2]);
    expect(body.data.messages[0].content).toBe('get-msg 0');
  });

  it('8b) GET .../messages 不存在 session → BIZ_ERROR 40002', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/sessions/99999999/messages')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    expect(res.body.code).toBe(40002);
  });

  // ============================================================
  // PATCH message (流式期间增量更新)
  // ============================================================

  it('8c) PATCH .../messages/:msgId 增量更新 content + status=2(streaming)', async () => {
    const sessionKey = `test-int-patchmsg-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId: 'v-patchmsg' })
      .expect(201);
    const sessionId = (createRes.body as ApiResp<{ id: number }>).data.id;

    const appendRes = await request(app.getHttpServer())
      .post(`/api/internal/cs/sessions/${sessionId}/messages`)
      .set('X-Internal-Token', internalToken)
      .send({ role: 'assistant', content: '初始内容', status: 1 })
      .expect(201);
    const msgId = (appendRes.body as ApiResp<{ id: number }>).data.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/internal/cs/sessions/${sessionId}/messages/${msgId}`)
      .set('X-Internal-Token', internalToken)
      .send({ content: '增量更新内容', status: 2 })
      .expect(200);
    const body = patchRes.body as ApiResp<{
      id: number;
      content: string;
      status: number;
    }>;
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(msgId);
    expect(body.data.content).toBe('增量更新内容');
    expect(body.data.status).toBe(2);

    // GET 验持久化
    const getRes = await request(app.getHttpServer())
      .get(`/api/internal/cs/sessions/${sessionId}/messages`)
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const msgs = (getRes.body as ApiResp<{ messages: Array<{ id: number; content: string; status: number }> }>).data.messages;
    const found = msgs.find((m) => m.id === msgId);
    expect(found).toBeDefined();
    expect(found!.content).toBe('增量更新内容');
    expect(found!.status).toBe(2);
  });

  it('8d) PATCH .../messages/:msgId 跨 session → BIZ_ERROR 40002', async () => {
    // session A 建一条 msg
    const keyA = `test-int-patchA-${Date.now()}`;
    const sa = (await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey: keyA, visitorId: 'v-A' })
      .expect(201)).body as ApiResp<{ id: number }>;
    const ma = (await request(app.getHttpServer())
      .post(`/api/internal/cs/sessions/${sa.data.id}/messages`)
      .set('X-Internal-Token', internalToken)
      .send({ role: 'user', content: 'A 的消息' })
      .expect(201)).body as ApiResp<{ id: number }>;

    // session B 试图 PATCH A 的 msgId → 应失败(双重防御)
    const keyB = `test-int-patchB-${Date.now()}`;
    const sb = (await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey: keyB, visitorId: 'v-B' })
      .expect(201)).body as ApiResp<{ id: number }>;

    const res = await request(app.getHttpServer())
      .patch(`/api/internal/cs/sessions/${sb.data.id}/messages/${ma.data.id}`)
      .set('X-Internal-Token', internalToken)
      .send({ content: '篡改' })
      .expect(200);
    expect(res.body.code).toBe(40002);
  });

  it('8e) PATCH .../messages/:msgId 不存在 msgId → BIZ_ERROR 40002', async () => {
    const sessionKey = `test-int-patch404-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId: 'v-404' })
      .expect(201);
    const sessionId = (createRes.body as ApiResp<{ id: number }>).data.id;

    const res = await request(app.getHttpServer())
      .patch(`/api/internal/cs/sessions/${sessionId}/messages/99999999`)
      .set('X-Internal-Token', internalToken)
      .send({ content: '不存在的 msg' })
      .expect(200);
    expect(res.body.code).toBe(40002);
  });

  // ============================================================
  // Order by orderNo
  // ============================================================

  it('9) GET /api/internal/cs/orders/ORD-20260624001 → 返完整 + items', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/orders/ORD-20260624001')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as ApiResp<{
      orderNo: string;
      customerName: string;
      items: Array<{ id: number; productName: string }>;
    }>;
    expect(body.code).toBe(0);
    expect(body.data.orderNo).toBe('ORD-20260624001');
    expect(body.data.customerName).toBeTruthy();
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('10) GET /api/internal/cs/orders/NONEXISTENT → ORDER_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/orders/DOES-NOT-EXIST-XXX')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    expect(res.body.code).toBe(30003);
  });

  // ============================================================
  // Ticket create
  // ============================================================

  it('11) POST /api/internal/cs/tickets 创建 → ticketNo + slaDeadline', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/internal/cs/tickets')
      .set('X-Internal-Token', internalToken)
      .send({
        title: `Day 9 集成测试 ${Date.now()}`,
        content: '内部 API 工单创建测试',
        priority: 1,
        category: 'integration',
      })
      .expect(201);
    const body = res.body as ApiResp<{
      ticketNo: string;
      status: number;
      slaDeadline: string;
      priority: number;
    }>;
    expect(body.code).toBe(0);
    expect(body.data.ticketNo).toMatch(/^T-\d{8}\d{3}$/);
    expect(body.data.status).toBe(1);
    expect(new Date(body.data.slaDeadline).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(body.data.priority).toBe(1);
  });

  // ============================================================
  // File download 鉴权
  // ============================================================

  it('12) GET /api/files/xxx 无 auth → UNAUTHORIZED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/files/some-fake-path')
      .expect(200);
    expect(res.body.code).toBe(10001);
  });

  it('13) GET /api/files/xxx 有 internal token → 不存在 30004(鉴权通过但资源缺)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/files/some-fake-path')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    // 鉴权通过,查不到 file_meta 返 30004
    expect(res.body.code).toBe(30004);
  });

  // ============================================================
  // Dict route order 验证(Bug #4)
  // ============================================================

  it('14) GET /api/dicts/types(不是 /:code) → 200 + 字典类型列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dicts/types')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as ApiResp<
      Array<{ code: string; label: string; itemCount: number }>
    >;
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    // seed 至少有 4 个 dict type
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });
});
