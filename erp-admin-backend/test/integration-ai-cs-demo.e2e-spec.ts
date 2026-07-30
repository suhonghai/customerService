import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Integration E2E(Day 10)— 模拟 ai-cs-demo 调用 erp-admin 内部 API
 *
 * 业务场景:ai-cs-demo 是 AI 客服前端,通过 INTERNAL_TOKEN 调 erp-admin 6 个内部 API:
 *   1. 启动 → 拉 active AI 配置(apiKey)
 *   2. 用户问 FAQ → 语义检索
 *   3. 用户问订单 → 查订单
 *   4. 用户转人工 → 创建工单
 *   5. 用户开新会话 → upsert session
 *   6. 多轮对话 → 累加 message
 *
 * 这个测试模拟真实 ai-cs-demo 调用 erp-admin 的端到端场景,验证 erp-admin
 * 内部 API 在跨服务场景下的契约一致性。
 */
describe('Integration: ai-cs-demo ↔ erp-admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const internalToken = process.env.INTERNAL_TOKEN ?? '';

  beforeAll(async () => {
    if (!internalToken) {
      throw new Error('INTERNAL_TOKEN not set in env');
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

    // admin token(用于 GET /api/sessions/:id 校验 messageCount)
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' })
      .expect(200);
    adminToken = (loginRes.body as { data: { accessToken: string } }).data.accessToken;
  });

  afterAll(async () => {
    // 清理集成测试残留的 session
    await prisma.csMessage.deleteMany({
      where: { session: { visitorId: { startsWith: 'v-int-' } } },
    });
    await prisma.csSession.deleteMany({
      where: { visitorId: { startsWith: 'v-int-' } },
    });
    await app.close();
  });

  // ============================================================
  // 1. AI 启动时拉 active 配置(apiKey 明文,供 ai-cs-demo)
  // ============================================================
  it('1) AI 启动 → 拉 active 配置 + apiKey', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/ai-config/active')
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        code: string;
        name: string;
        apiKey: string;
        baseUrl: string;
        modelId: string;
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.code).toBe('qwen3.7-plus');
    expect(body.data.apiKey).toBeTruthy();
    // apiKey 应至少有 20 字符(OpenAI/DashScope 风格 sk-xxx)
    expect(body.data.apiKey.length).toBeGreaterThanOrEqual(20);
    expect(body.data.baseUrl).toMatch(/^https?:\/\//);
    expect(body.data.modelId).toBeTruthy();
  });

  // ============================================================
  // 2. FAQ 语义检索 — 用户问"如何退款"命中
  // ============================================================
  it('2) FAQ 检索:用户问"如何退款" → 命中 chunks', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/internal/cs/faq/search?q=' + encodeURIComponent('如何退款'))
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        chunks: { content: string; distance: number; metadata: Record<string, unknown> }[];
      };
    };
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data.chunks)).toBe(true);
    // seed 2 个 FAQ,关键词"退款"/"退货" 应能命中至少 1 个
    expect(body.data.chunks.length).toBeGreaterThanOrEqual(1);
    // distance 是余弦距离:越小越相似(>= 0,< 2)
    for (const c of body.data.chunks) {
      expect(typeof c.distance).toBe('number');
      expect(c.distance).toBeGreaterThanOrEqual(0);
      expect(c.content.length).toBeGreaterThan(0);
    }
  });

  // ============================================================
  // 3. 订单查询 — AI 对话"我的订单物流"
  // ============================================================
  it('3) 订单查询:按 orderNo 查订单 + items', async () => {
    // 先拿一个真实存在的 orderNo(从 admin 列表拿第 1 条)
    const listRes = await request(app.getHttpServer())
      .get('/api/orders?pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const orderNo = (
      listRes.body as { data: { list: { orderNo: string }[] } }
    ).data.list[0].orderNo;

    const res = await request(app.getHttpServer())
      .get(`/api/internal/cs/orders/${orderNo}`)
      .set('X-Internal-Token', internalToken)
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        orderNo: string;
        status: number;
        totalAmount: string; // Decimal → string in JSON
        items: { productName: string; quantity: number }[];
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.orderNo).toBe(orderNo);
    // Decimal 经 JSON 序列化为 string,转 number 校验
    expect(Number(body.data.totalAmount)).toBeGreaterThan(0);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // 4. 用户转人工 → 创建工单
  // ============================================================
  it('4) 转人工 → 创建工单 + ticketNo', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/internal/cs/tickets')
      .set('X-Internal-Token', internalToken)
      .send({
        title: '集成测试工单',
        content: 'Day 10 集成测试 — 用户转人工',
        priority: 2,
      })
      .expect(201);
    const body = res.body as {
      code: number;
      data: { id: number; ticketNo: string; title: string; priority: number };
    };
    expect(body.code).toBe(0);
    // ticketNo 格式 T-YYYYMMDDXXX
    expect(body.data.ticketNo).toMatch(/^T-\d{8}\d{3}$/);
    expect(body.data.title).toBe('集成测试工单');
    expect(body.data.priority).toBe(2);
  });

  // ============================================================
  // 5. 开新会话 → upsert session(同 sessionKey 重复调 = 同一会话)
  // ============================================================
  it('5) 开新会话 → upsert(sessionKey 重复 = 同一会话)', async () => {
    const sessionKey = `v-int-upsert-${Date.now()}`;
    const visitorId = 'v-int-upsert';

    // 第 1 次创建 — service 用 messageCount={ increment: 1 } 实现,新会话首次=1
    const r1 = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId, visitorName: '集成测试', aiModelCode: 'qwen3.7-plus' })
      .expect(201);
    const b1 = r1.body as { code: number; data: { id: number; messageCount: number } };
    expect(b1.code).toBe(0);
    expect(b1.data.messageCount).toBe(1);
    const sid = b1.data.id;

    // 第 2 次 upsert(同 sessionKey)
    const r2 = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId, visitorName: '集成测试', aiModelCode: 'qwen3.7-plus' })
      .expect(201);
    const b2 = r2.body as { code: number; data: { id: number } };
    expect(b2.code).toBe(0);
    expect(b2.data.id).toBe(sid); // 同 sessionKey → 同 id
  });

  // ============================================================
  // 6. 多轮对话 → 累加 message + messageCount 同步
  // ============================================================
  it('6) 多轮对话:5 条消息 → session.messageCount = 5', async () => {
    const sessionKey = `v-int-multi-${Date.now()}`;
    const visitorId = 'v-int-multi';

    const sessRes = await request(app.getHttpServer())
      .post('/api/internal/cs/sessions')
      .set('X-Internal-Token', internalToken)
      .send({ sessionKey, visitorId, visitorName: '集成测试-多轮', aiModelCode: 'qwen3.7-plus' })
      .expect(201);
    const sid = (sessRes.body as { data: { id: number } }).data.id;

    // 发 5 条消息(交替 user/assistant)
    for (let i = 0; i < 5; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${sid}/messages`)
        .set('X-Internal-Token', internalToken)
        .send({ role, content: `集成测试消息 ${i + 1}` })
        .expect(201);
    }

    // 验证 messageCount(通过 admin GET /api/sessions/:id)
    const sessionRes = await request(app.getHttpServer())
      .get(`/api/sessions/${sid}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = sessionRes.body as {
      code: number;
      data: { messageCount: number; preview: string | null };
    };
    expect(body.code).toBe(0);
    expect(body.data.messageCount).toBe(5);
    expect(body.data.preview).toBeTruthy();
    expect(body.data.preview).toContain('集成测试消息');
  });
});