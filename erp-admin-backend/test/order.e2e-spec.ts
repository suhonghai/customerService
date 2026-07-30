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
 * 订单模块 E2E(Day 6)
 *
 * 覆盖:
 * - 创建 / 列表 / 详情 / 更新 / 改状态 / 退款 / CSV 导出
 * - 多维筛选(orderStatus / payStatus / 日期 / 金额)
 * - 状态机(合法 + 非法 40003)
 * - 全退 + 部分退
 * - DataScope(scope 1 admin / scope 2 lead / scope 3 agent)
 * - 无权限 10101
 */
describe('订单管理 (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let leadToken: string;
  let agentToken: string;
  let editorToken: string;

  let newOrderId: number;
  let newOrderNo: string;

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
    editorToken = await login(app, 'editor01', 'Editor@123');
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) admin POST /api/orders 创建订单(自动生成 orderNo)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerName: 'E2E客户',
        customerPhone: '13900000001',
        customerEmail: 'e2e@example.com',
        address: '上海市浦东新区',
        payMethod: 'wechat',
        remark: 'e2e 测试',
        items: [
          { productId: 'P-E2E-1', productName: 'E2E商品A', price: 50, quantity: 2 },
          { productId: 'P-E2E-2', productName: 'E2E商品B', price: 30, quantity: 1 },
        ],
      })
      .expect(200);
    const body = res.body as { code: number; data: { id: number; orderNo: string; totalAmount: number; items: unknown[] } };
    expect(body.code).toBe(0);
    expect(body.data.orderNo).toMatch(/^ORD-\d{8}\d{3}$/);
    expect(body.data.totalAmount).toBe(130);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBe(2);
    newOrderId = body.data.id;
    newOrderNo = body.data.orderNo;
  });

  it('2) admin GET /api/orders 列表包含 seed + 新建订单', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { total: number; list: { orderNo: string }[] } };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(8);
    const nos = body.data.list.map((o) => o.orderNo);
    expect(nos).toContain(newOrderNo);
  });

  it('3) 多维筛选 orderStatus=1 + payStatus=2 只返"待发货"', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders?orderStatus=1&payStatus=2')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: { orderStatus: number; payStatus: number }[] } };
    expect(body.code).toBe(0);
    expect(body.data.list.length).toBeGreaterThan(0);
    for (const o of body.data.list) {
      expect(o.orderStatus).toBe(1);
      expect(o.payStatus).toBe(2);
    }
  });

  it('4) 日期范围筛选 startDate / endDate', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app.getHttpServer())
      .get(`/api/orders?startDate=${today}&endDate=${today}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThan(0);
  });

  it('5) 金额范围筛选 minAmount=100, maxAmount=200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders?minAmount=100&maxAmount=200')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: { payAmount: number }[] } };
    expect(body.code).toBe(0);
    for (const o of body.data.list) {
      expect(o.payAmount).toBeGreaterThanOrEqual(100);
      expect(o.payAmount).toBeLessThanOrEqual(200);
    }
  });

  it('6) GET /api/orders/:id 详情(含 items)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/orders/${newOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { id: number; items: unknown[] } };
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(newOrderId);
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.items.length).toBe(2);
  });

  it('7) PUT /api/orders/:id/status 1→2 已发货(需 shipNo)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/orders/${newOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 2, shipNo: 'SF-E2E-001', shipCompany: '顺丰' })
      .expect(200);
    const body = res.body as { code: number; data: { orderStatus: number; shipNo: string; shippedAt: string } };
    expect(body.code).toBe(0);
    expect(body.data.orderStatus).toBe(2);
    expect(body.data.shipNo).toBe('SF-E2E-001');
    expect(body.data.shippedAt).toBeTruthy();
  });

  it('8) 状态机校验:已完成→已发货 → 40003', async () => {
    // seed order 5 is status=4(已完成)
    const listRes = await request(app.getHttpServer())
      .get('/api/orders?orderStatus=4')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = listRes.body as { data: { list: { id: number }[] } };
    expect(listBody.data.list.length).toBeGreaterThan(0);
    const completedId = listBody.data.list[0].id;

    const res = await request(app.getHttpServer())
      .put(`/api/orders/${completedId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 2, shipNo: 'X', shipCompany: 'X' });
    const body = res.body as { code: number; message: string };
    expect(body.code).toBe(40003);
    expect(body.message).toMatch(/不允许/);
  });

  it('9) PUT status 1→5 已取消(取消)', async () => {
    // 建一个新订单测取消
    const createRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerName: '取消测试',
        customerPhone: '13900000002',
        address: '广州',
        items: [{ productId: 'P-X', productName: 'X', price: 10, quantity: 1 }],
      })
      .expect(200);
    const createBody = createRes.body as { data: { id: number } };
    const cancelId = createBody.data.id;

    const res = await request(app.getHttpServer())
      .put(`/api/orders/${cancelId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newStatus: 5 })
      .expect(200);
    const body = res.body as { code: number; data: { orderStatus: number; cancelledAt: string } };
    expect(body.code).toBe(0);
    expect(body.data.orderStatus).toBe(5);
    expect(body.data.cancelledAt).toBeTruthy();
  });

  it('10) 全额退款 → payStatus=3', async () => {
    // 先 SQL 设 payStatus=2(已支付),因为默认 1 不能退
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      `UPDATE \`order\` SET pay_status = 2, paid_at = NOW() WHERE id = ${newOrderId}`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${newOrderId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ refundAmount: 130, reason: '客户取消' })
      .expect(200);
    const body = res.body as { code: number; data: { payStatus: number; refundAmount: number; refundedAt: string } };
    expect(body.code).toBe(0);
    expect(body.data.payStatus).toBe(3); // 已退款
    expect(body.data.refundAmount).toBe(130);
    expect(body.data.refundedAt).toBeTruthy();
  });

  it('11) 部分退款 → payStatus=4', async () => {
    // 建一个新订单
    const createRes = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerName: '部分退款',
        customerPhone: '13900000003',
        address: '深圳',
        items: [{ productId: 'P-P', productName: 'P', price: 200, quantity: 1 }],
      })
      .expect(200);
    const createBody = createRes.body as { data: { id: number } };
    const partialId = createBody.data.id;

    // 设 payStatus=2
    const prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      `UPDATE \`order\` SET pay_status = 2, paid_at = NOW() WHERE id = ${partialId}`,
    );

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${partialId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ refundAmount: 50, reason: '部分退款测试' })
      .expect(200);
    const body = res.body as { code: number; data: { payStatus: number; refundAmount: number } };
    expect(body.code).toBe(0);
    expect(body.data.payStatus).toBe(4); // 部分退款
    expect(body.data.refundAmount).toBe(50);
  });

  it('12) GET /api/orders/export → CSV(Content-Type + BOM + header)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const buf = res.body as Buffer;
    expect(buf.length).toBeGreaterThan(10);
    // BOM 验证
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    // header 行
    const text = buf.toString('utf8');
    const firstLine = text.split('\n')[0];
    expect(firstLine).toMatch(/orderNo/);
    expect(firstLine).toMatch(/customerName/);
  });

  it('13) DataScope: agent_lead01 (scope=2 dept=1) 看到 dept 1 订单', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${leadToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { total: number } };
    expect(body.code).toBe(0);
    // agent_lead01 dept=1 scope=2,admin dept=1 创建的订单都能看到(>= 6)
    expect(body.data.total).toBeGreaterThan(0);
  });

  it('14) DataScope: agent01 (scope=3 本人) → 0 条', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${agentToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { total: number; list: unknown[] } };
    expect(body.code).toBe(0);
    // agent01 没创建订单 → 0 条
    expect(body.data.total).toBe(0);
    expect(body.data.list.length).toBe(0);
  });

  it('15) 无权限 agent01 POST /api/orders → 10101', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/orders')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        customerName: 'hack',
        customerPhone: '13900000099',
        address: 'hack',
        items: [{ productId: 'H', productName: 'H', price: 1, quantity: 1 }],
      });
    const body = res.body as { code: number };
    expect(body.code).toBe(10101);
  });

  it('16) editor01 (dept=3, scope=1) GET /api/orders 全可见', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/orders')
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { total: number } };
    expect(body.code).toBe(0);
    // editor scope=1 ALL
    expect(body.data.total).toBeGreaterThanOrEqual(8);
  });
});