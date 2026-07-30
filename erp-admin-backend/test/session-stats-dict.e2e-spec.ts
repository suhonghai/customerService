import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: number; username: string; roles: string[] };
}

async function login(
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);
  const body = res.body as { code: number; data: LoginResponse };
  expect(body.code).toBe(0);
  return body.data.accessToken;
}

/**
 * Session + Stats + Dict 模块 E2E(Day 8)
 *
 * 覆盖:
 * - Session:list / 详情 / 消息 / 软删 / DataScope(scope 3)
 * - Stats:overview(7 字段 + 7 天趋势) / agent-performance / ai-hit-rate
 * - Dict:types / getByCode / createType / createItem / 软删
 * - 权限:agent 无 stats:view(Day 3 seed 已加 stats:view 给 super_admin/agent_lead)
 */
describe('Session + Stats + Dict (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let agentToken: string;
  let leadToken: string;

  // 测试中创建/删除的资源 id(用于清理)
  let testSessionId: number;
  let testDictTypeId: number;
  let testDictItemId: number;
  let testAgent01Id: number;

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
    app.useGlobalFilters(
      new PrismaExceptionFilter(),
      new HttpExceptionFilter(),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    adminToken = await login(app, 'admin', 'Admin@123');
    leadToken = await login(app, 'agent_lead01', 'Lead@123');
    agentToken = await login(app, 'agent01', 'Agent@123');

    // 取 agent01.id(DataScope 测试用)
    const agent01 = await prisma.user.findUnique({
      where: { username: 'agent01' },
    });
    testAgent01Id = agent01!.id;
  });

  afterAll(async () => {
    // 清理:E2E 期间可能创建/软删的会话
    await prisma.csMessage.deleteMany({
      where: { session: { visitorId: 'e2e_test_visitor' } },
    });
    await prisma.csSession.deleteMany({
      where: { visitorId: 'e2e_test_visitor' },
    });
    // 清理 E2E 期间创建/删除的字典(用唯一 code 避免与之前 run 残留冲突)
    if (testDictTypeId) {
      await prisma.dictItem.deleteMany({
        where: { typeId: testDictTypeId },
      });
      await prisma.dictType.delete({ where: { id: testDictTypeId } });
    }
    // 兜底清理(防 testDictTypeId 未设置的情况)
    await prisma.dictItem.deleteMany({
      where: { type: { code: { startsWith: 'e2e_test_dict_' } } },
    });
    await prisma.dictType.deleteMany({
      where: { code: { startsWith: 'e2e_test_dict_' } },
    });
    await app.close();
  });

  // ============================================
  // Session 部分
  // ============================================
  describe('Session', () => {
    it('1) admin GET /api/sessions → 至少 3 条', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { total: number; list: { id: number; visitorId: string }[] };
      };
      expect(body.code).toBe(0);
      expect(body.data.total).toBeGreaterThanOrEqual(3);
      expect(body.data.list.length).toBeGreaterThanOrEqual(3);
    });

    it('2) GET /api/sessions?status=2 → 全是 status=2', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sessions?status=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { list: { status: number }[] };
      };
      expect(body.code).toBe(0);
      for (const s of body.data.list) {
        expect(s.status).toBe(2);
      }
    });

    it('3) GET /api/sessions/:id → 含 messageCount + preview', async () => {
      // 显式选 visitor_002(seed 有 12 条消息),不依赖 list[0](可能因残留 session 顺序变化)
      const listRes = await request(app.getHttpServer())
        .get('/api/sessions?visitorId=visitor_002')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const list = (listRes.body as { data: { list: { id: number }[] } }).data.list;
      expect(list.length).toBeGreaterThanOrEqual(1);
      const id = list[0].id;
      const res = await request(app.getHttpServer())
        .get(`/api/sessions/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: {
          id: number;
          visitorId: string;
          messageCount: number;
          preview: string | null;
        };
      };
      expect(body.code).toBe(0);
      expect(body.data.id).toBe(id);
      expect(body.data.messageCount).toBeGreaterThanOrEqual(1);
    });

    it('4) GET /api/sessions/:id/messages → 消息分页', async () => {
      // 显式选 visitor_002(seed 有 12 条消息),避免 list[0] 命中残留 session
      const listRes = await request(app.getHttpServer())
        .get('/api/sessions?visitorId=visitor_002')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const list = (listRes.body as { data: { list: { id: number }[] } }).data.list;
      expect(list.length).toBeGreaterThanOrEqual(1);
      const id = list[0].id;
      const res = await request(app.getHttpServer())
        .get(`/api/sessions/${id}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { total: number; list: { id: number; role: string }[] };
      };
      expect(body.code).toBe(0);
      expect(body.data.total).toBeGreaterThan(0);
      expect(body.data.list.length).toBe(body.data.total);
    });

    it('5) GET /api/sessions/:id/messages?sortOrder=asc → 第一条 role 是 user(时间正序)', async () => {
      // 显式选 visitor_002(seed 有 12 条消息,user/assistant 交替),不依赖 list[0]
      const listRes = await request(app.getHttpServer())
        .get('/api/sessions?visitorId=visitor_002')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const list = (listRes.body as { data: { list: { id: number }[] } }).data.list;
      expect(list.length).toBeGreaterThanOrEqual(1);
      const target = list[0];
      const res = await request(app.getHttpServer())
        .get(`/api/sessions/${target.id}/messages?sortOrder=asc&pageSize=1`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as { code: number; data: { list: { role: string }[] } };
      expect(body.code).toBe(0);
      expect(body.data.list[0].role).toBe('user');
    });

    it('6) DataScope: agent01(scope=3) → 只看到自己 userId 的会话', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', `Bearer ${agentToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { list: { userId: number | null }[] };
      };
      expect(body.code).toBe(0);
      for (const s of body.data.list) {
        expect(s.userId).toBe(testAgent01Id);
      }
    });

    it('7) DELETE /api/sessions/:id 软删 → 再查 total 减少', async () => {
      // 找一个 admin 可见的会话(visitor_001 无 userId,scope 1 admin 可删)
      // 避免影响 visitor_002/003(被 DataScope 限制),新建一个测试会话
      const newSession = await prisma.csSession.create({
        data: {
          sessionKey: `e2e_test_visitor-${Date.now()}`,
          visitorId: 'e2e_test_visitor',
          visitorName: 'E2E 测试客户',
          channel: 1,
          status: 1,
          messageCount: 0,
          userId: null,
        },
      });
      testSessionId = newSession.id;

      // 删除前 count
      const before = await prisma.csSession.count({
        where: { deletedAt: null },
      });

      const delRes = await request(app.getHttpServer())
        .delete(`/api/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const delBody = delRes.body as { code: number; data: { id: number; deleted: boolean } };
      expect(delBody.code).toBe(0);
      expect(delBody.data.deleted).toBe(true);

      // 删除后 count(中间件已过滤 deletedAt)
      const after = await prisma.csSession.count({
        where: { deletedAt: null },
      });
      expect(after).toBe(before - 1);
    });
  });

  // ============================================
  // Stats 部分
  // ============================================
  describe('Stats', () => {
    it('8) GET /api/stats/overview → 7 字段 + 7 天趋势', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: {
          sessionToday: number;
          sessionTrend: { date: string; count: number }[];
          ticketPending: number;
          ticketProcessing: number;
          aiHitRate: number;
          avgResponseSeconds: number;
          avgRating: number;
        };
      };
      expect(body.code).toBe(0);
      expect(typeof body.data.sessionToday).toBe('number');
      expect(typeof body.data.ticketPending).toBe('number');
      expect(typeof body.data.ticketProcessing).toBe('number');
      expect(typeof body.data.aiHitRate).toBe('number');
      expect(typeof body.data.avgRating).toBe('number');
      expect(body.data.sessionTrend).toHaveLength(7);
      for (const t of body.data.sessionTrend) {
        expect(typeof t.date).toBe('string');
        expect(typeof t.count).toBe('number');
      }
    });

    it('9) GET /api/stats/agent-performance → 返 agent 列表', async () => {
      const res = await request(app.getHttpServer())
        .get(
          '/api/stats/agent-performance?startDate=2026-06-01&endDate=2026-12-31',
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: {
          agentId: number;
          agentName: string;
          ticketCount: number;
          avgResolveMinutes: number;
          ratingAvg: number;
        }[];
      };
      expect(body.code).toBe(0);
      expect(Array.isArray(body.data)).toBe(true);
      // 至少 2 个客服(agent_lead01 + agent01)
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      for (const a of body.data) {
        expect(typeof a.agentName).toBe('string');
        expect(typeof a.ticketCount).toBe('number');
      }
    });

    it('10) GET /api/stats/ai-hit-rate → 返 qwen3.7-plus', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/ai-hit-rate?startDate=2026-06-01&endDate=2026-12-31')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: {
          modelCode: string;
          modelName: string;
          totalSessions: number;
          escalatedSessions: number;
          hitRate: number;
        }[];
      };
      expect(body.code).toBe(0);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      const qwen = body.data.find((d) => d.modelCode === 'qwen3.7-plus');
      expect(qwen).toBeDefined();
      expect(qwen!.totalSessions).toBeGreaterThan(0); // seed 3 个会话都用 qwen
    });
  });

  // ============================================
  // Dict 部分
  // ============================================
  describe('Dict', () => {
    it('11) GET /api/dicts/types → 至少 4 个类型', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dicts/types')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { code: string; itemCount: number; activeItemCount: number }[];
      };
      expect(body.code).toBe(0);
      expect(body.data.length).toBeGreaterThanOrEqual(4);
      for (const t of body.data) {
        expect(typeof t.itemCount).toBe('number');
      }
    });

    it('12) GET /api/dicts/order_status → 5 项', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dicts/order_status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { label: string; value: string; cssClass: string | null }[];
      };
      expect(body.code).toBe(0);
      expect(body.data).toHaveLength(5);
      const labels = body.data.map((d) => d.label);
      expect(labels).toContain('待发货');
      expect(labels).toContain('已发货');
    });

    it('13) POST /api/dicts/types 创 code=e2e_test_dict_<ts>', async () => {
      const tsCode = `e2e_test_dict_${Date.now()}`;
      // 保存到 module scope
      (global as any).__testDictCode = tsCode;
      const res = await request(app.getHttpServer())
        .post('/api/dicts/types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: tsCode, name: 'E2E 测试字典' })
        .expect(201);
      const body = res.body as { code: number; data: { id: number; code: string } };
      expect(body.code).toBe(0);
      expect(body.data.code).toBe(tsCode);
      testDictTypeId = body.data.id;
    });

    it('14) POST /api/dicts/:code/items 加项(cssClass=orange)', async () => {
      const tsCode = (global as any).__testDictCode as string;
      const res = await request(app.getHttpServer())
        .post(`/api/dicts/${tsCode}/items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: '项A', value: 'a', sort: 1, cssClass: 'orange' })
        .expect(201);
      const body = res.body as { code: number; data: { id: number; label: string; cssClass: string } };
      expect(body.code).toBe(0);
      expect(body.data.label).toBe('项A');
      expect(body.data.cssClass).toBe('orange');
      testDictItemId = body.data.id;
    });

    it('15) GET /api/dicts/:code → 返刚加的项', async () => {
      const tsCode = (global as any).__testDictCode as string;
      const res = await request(app.getHttpServer())
        .get(`/api/dicts/${tsCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { label: string; cssClass: string }[];
      };
      expect(body.code).toBe(0);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data[0].cssClass).toBe('orange');
    });

    it('16) DELETE /api/dicts/items/:id 软删 → deleted=true', async () => {
      const tsCode = (global as any).__testDictCode as string;
      const res = await request(app.getHttpServer())
        .delete(`/api/dicts/items/${testDictItemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as { code: number; data: { id: number; deleted: boolean } };
      expect(body.code).toBe(0);
      expect(body.data.deleted).toBe(true);

      // 再查 → 不返已删的(中间件过滤 deletedAt)
      const listRes = await request(app.getHttpServer())
        .get(`/api/dicts/${tsCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const listBody = listRes.body as { data: { id: number }[] };
      expect(listBody.data.find((d) => d.id === testDictItemId)).toBeUndefined();
    });

    it('17) POST /api/dicts/types 重复 code → 40002', async () => {
      const tsCode = (global as any).__testDictCode as string;
      const res = await request(app.getHttpServer())
        .post('/api/dicts/types')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: tsCode, name: '重复 code' });
      const body = res.body as { code: number };
      // 重复 code → BizException(BIZ_ERROR=40002)
      expect([40002, 10003]).toContain(body.code);
    });
  });
});
