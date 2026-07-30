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
 * 工单模块 E2E(Day 7)
 *
 * 覆盖:
 * - 列表 / 详情(含 logs) / 创建 / 分配 / 改状态 / 回复 / logs 单独 / stats
 * - ticketNo 自动生成(T-YYYYMMDDXXX)
 * - SLA deadline 计算(priority 1→2h / 2→8h)
 * - 状态机(合法 + 非法 40003,如 4→2)
 * - reply 不改 status(只写 log)
 * - 筛选:priority / overdue
 * - DataScope(scope 1 admin / scope 2 lead / scope 3 agent)
 * - 无权限 10101
 */
describe('工单管理 (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let leadToken: string;
  let agentToken: string;

  let newTicketId: number;
  let newTicketNo: string;
  let agent01Id: number;

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

    adminToken = await login(app, 'admin', 'Admin@123');
    leadToken = await login(app, 'agent_lead01', 'Lead@123');
    agentToken = await login(app, 'agent01', 'Agent@123');

    // 取 agent01 的 id(测试 assign)
    const prisma = app.get(PrismaService);
    const agent01 = await prisma.user.findUnique({
      where: { username: 'agent01' },
    });
    agent01Id = agent01!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) admin POST /api/tickets 创建工单(自动 ticketNo + SLA 8h)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'E2E 测试工单 1',
        content: '客户反馈的工单内容详情...',
        priority: 2,
        category: '退款',
      })
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        id: number;
        ticketNo: string;
        status: number;
        priority: number;
        slaDeadline: string;
        slaOverdue: boolean;
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.ticketNo).toMatch(/^T-\d{8}\d{3}$/);
    expect(body.data.status).toBe(1); // 待领取
    expect(body.data.priority).toBe(2);
    // SLA 在 8h 后(± 5min 容忍)
    const sla = new Date(body.data.slaDeadline).getTime();
    const now = Date.now();
    expect(sla - now).toBeGreaterThan(7.9 * 3600 * 1000);
    expect(sla - now).toBeLessThan(8.1 * 3600 * 1000);
    expect(body.data.slaOverdue).toBe(false);
    newTicketId = body.data.id;
    newTicketNo = body.data.ticketNo;
  });

  it('2) admin POST /api/tickets priority=1 → SLA 2h', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: '高优紧急工单',
        content: '紧急问题反馈',
        priority: 1,
        category: '系统',
      })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { id: number; ticketNo: string; priority: number; slaDeadline: string };
    };
    expect(body.code).toBe(0);
    expect(body.data.priority).toBe(1);
    const sla = new Date(body.data.slaDeadline).getTime();
    const now = Date.now();
    expect(sla - now).toBeGreaterThan(1.9 * 3600 * 1000);
    expect(sla - now).toBeLessThan(2.1 * 3600 * 1000);
  });

  it('3) admin GET /api/tickets 列表 ≥ 7 条(含 seed 5 + 新建 2)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { total: number; list: { ticketNo: string }[] };
    };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(7);
    const nos = body.data.list.map((t) => t.ticketNo);
    expect(nos).toContain(newTicketNo);
  });

  it('4) 筛选 priority=1 → 含 SLA 过期那条', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tickets?priority=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: { priority: number; ticketNo: string }[] };
    };
    expect(body.code).toBe(0);
    expect(body.data.list.length).toBeGreaterThan(0);
    for (const t of body.data.list) {
      expect(t.priority).toBe(1);
    }
    // seed 第 5 条 SLA 过期 = priority=1
    const nos = body.data.list.map((t) => t.ticketNo);
    expect(nos).toContain('T-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '005');
  });

  it('5) 筛选 overdue=true → 含 SLA 过期那条', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tickets?overdue=true')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: { ticketNo: string; slaOverdue: boolean }[] };
    };
    expect(body.code).toBe(0);
    expect(body.data.list.length).toBeGreaterThan(0);
    for (const t of body.data.list) {
      expect(t.slaOverdue).toBe(true);
    }
  });

  it('6) GET /api/tickets/:id 详情(含 logs)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/tickets/${newTicketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { id: number; logs: { action: string }[] };
    };
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(newTicketId);
    expect(Array.isArray(body.data.logs)).toBe(true);
    expect(body.data.logs.length).toBeGreaterThanOrEqual(1);
    expect(body.data.logs[0].action).toBe('create');
  });

  it('7) PUT /api/tickets/:id/assign → 分配给 agent01, status 改 2, + log', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${newTicketId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigneeId: agent01Id })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { status: number; assigneeId: number; logs?: { action: string }[] };
    };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe(2); // 处理中
    expect(body.data.assigneeId).toBe(agent01Id);

    // 再 GET 一次确认 logs 加了
    const detailRes = await request(app.getHttpServer())
      .get(`/api/tickets/${newTicketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const detailBody = detailRes.body as { data: { logs: { action: string }[] } };
    const actions = detailBody.data.logs.map((l) => l.action);
    expect(actions).toContain('assign');
    expect(actions).toContain('status_change'); // 1→2
  });

  it('8) PUT /api/tickets/:id/status 2→3 已解决 → resolvedAt 设值 + log', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${newTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 3, comment: '已为客户处理' })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { status: number; resolvedAt: string | null };
    };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe(3);
    expect(body.data.resolvedAt).toBeTruthy();
  });

  it('9) 状态机错误:已关闭(4)→ 处理中(2) → 40003', async () => {
    // seed 第 4 条 = T-...004 status=4
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const closedTicketNo = `T-${today}004`;
    // 先查 id
    const listRes = await request(app.getHttpServer())
      .get(`/api/tickets?ticketNo=${closedTicketNo}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = listRes.body as { data: { list: { id: number; status: number }[] } };
    expect(listBody.data.list.length).toBeGreaterThan(0);
    const closedId = listBody.data.list[0].id;
    expect(listBody.data.list[0].status).toBe(4);

    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${closedId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 2 });
    const body = res.body as { code: number; message: string };
    expect(body.code).toBe(40003);
    expect(body.message).toMatch(/不允许/);
  });

  it('10) 状态机错误:已解决(3)→ 待领取(1) → 40003', async () => {
    // 上面 newTicketId 已是 status=3
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${newTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 1 });
    const body = res.body as { code: number };
    expect(body.code).toBe(40003);
  });

  it('11) 合法转换:3 → 2 重开', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/tickets/${newTicketId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 2, comment: '客户不满意,重新打开' })
      .expect(200);
    const body = res.body as { code: number; data: { status: number; resolvedAt: string | null } };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe(2);
    expect(body.data.resolvedAt).toBeNull(); // 重开清 resolvedAt
  });

  it('12) POST /api/tickets/:id/reply → 加 log,不改 status', async () => {
    const before = await request(app.getHttpServer())
      .get(`/api/tickets/${newTicketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const beforeStatus = (before.body as { data: { status: number } }).data.status;
    const beforeLogCount = (before.body as { data: { logs: unknown[] } }).data.logs.length;

    const res = await request(app.getHttpServer())
      .post(`/api/tickets/${newTicketId}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '已为您重新处理,请查收' })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { ticketId: number; logId: number; createdAt: string };
    };
    expect(body.code).toBe(0);
    expect(body.data.ticketId).toBe(newTicketId);
    expect(body.data.logId).toBeGreaterThan(0);

    const after = await request(app.getHttpServer())
      .get(`/api/tickets/${newTicketId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const afterBody = after.body as { data: { status: number; logs: { action: string }[] } };
    expect(afterBody.data.status).toBe(beforeStatus); // status 没变
    expect(afterBody.data.logs.length).toBe(beforeLogCount + 1);
    expect(afterBody.data.logs[afterBody.data.logs.length - 1].action).toBe('reply');
  });

  it('13) GET /api/tickets/:id/logs 单独取 logs', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/tickets/${newTicketId}/logs`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { action: string }[] };
    expect(body.code).toBe(0);
    expect(body.data.length).toBeGreaterThanOrEqual(4); // create + assign + status_change×2 + reply
    const actions = body.data.map((l) => l.action);
    expect(actions).toContain('create');
    expect(actions).toContain('assign');
    expect(actions).toContain('status_change');
    expect(actions).toContain('reply');
  });

  it('14) GET /api/tickets/stats → 5 个数字', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tickets/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        pendingCount: number;
        processingCount: number;
        resolvedToday: number;
        overdueCount: number;
        avgResolveMinutes: number;
      };
    };
    expect(body.code).toBe(0);
    expect(typeof body.data.pendingCount).toBe('number');
    expect(typeof body.data.processingCount).toBe('number');
    expect(typeof body.data.resolvedToday).toBe('number');
    expect(typeof body.data.overdueCount).toBe('number');
    expect(typeof body.data.avgResolveMinutes).toBe('number');
    // pendingCount 至少 1(第 1 条 seed 待领取)
    expect(body.data.pendingCount).toBeGreaterThanOrEqual(1);
    // overdueCount 至少 1(第 5 条 SLA 过期)
    expect(body.data.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it('15) DataScope: agent01(scope=3) → 只能看到自己 assignee 的工单', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { total: number; list: { assigneeId: number | null }[] };
    };
    expect(body.code).toBe(0);
    // agent01 = id 4; seed 里 assignee=4 的有 #3(已解决)/ #4(已关闭)/ #5(SLA过期),共 3 条
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    for (const t of body.data.list) {
      expect(t.assigneeId).toBe(agent01Id);
    }
  });

  it('16) DataScope: agent_lead01(scope=2 dept=1) → 看 dept 1 客服的工单', async () => {
    // agent_lead01 dept=1(同 admin),agent_lead01 + admin 是 dept 1
    // seed #2 assignee=agent_lead01(dept 1) → agent_lead01 能看到
    const res = await request(app.getHttpServer())
      .get('/api/tickets')
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { total: number } };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('17) 无权限:agent01 POST /api/tickets → 10101(agent 没 ticket:create)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tickets')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'hack', content: 'hack content' });
    const body = res.body as { code: number };
    expect(body.code).toBe(10101);
  });
});
