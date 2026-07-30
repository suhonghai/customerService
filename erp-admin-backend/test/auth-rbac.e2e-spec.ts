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

describe('Auth + RBAC (e2e)', () => {
  let app: INestApplication;

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

    // 清理历史 e2e 测试数据(防重跑冲突)
    const prisma = app.get(PrismaService);
    const stale = await prisma.user.findMany({
      where: {
        username: { in: ['test01_e2e', 'to_delete_e2e', 'hack01_e2e'] },
      },
      select: { id: true },
    });
    if (stale.length > 0) {
      const ids = stale.map((u) => u.id);
      // 中间件只过滤软删,这里需要 hard delete 外键相关
      await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
      await prisma.userToken.deleteMany({ where: { userId: { in: ids } } });
      // 用 $executeRaw 绕过软删中间件
      await prisma.$executeRawUnsafe(
        `DELETE FROM user WHERE id IN (${ids.join(',')})`,
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('1) admin login + GET /api/users', async () => {
    const token = await login(app, 'admin', 'Admin@123');
    expect(token).toBeTruthy();
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: unknown[]; total: number };
    };
    expect(body.code).toBe(0);
    // admin + agent_lead01 + agent01 + editor01 >= 4
    expect(body.data.total).toBeGreaterThanOrEqual(4);
  });

  it('2) admin POST /api/users 创 test01', async () => {
    const token = await login(app, 'admin', 'Admin@123');
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'test01_e2e',
        password: 'Test@123',
        nickname: 'E2E测试',
        email: 'test01_e2e@example.com',
        roleIds: [3],
      })
      .expect(200);
    const body = res.body as { code: number; data: { id: number; username: string } };
    expect(body.code).toBe(0);
    expect(body.data.username).toBe('test01_e2e');
  });

  it('3) admin GET /api/roles 返 5+ 角色', async () => {
    const token = await login(app, 'admin', 'Admin@123');
    const res = await request(app.getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(5);
  });

  it('4) admin PUT /api/roles/:id/menus 分配菜单', async () => {
    const token = await login(app, 'admin', 'Admin@123');
    // 取当前实际的前 8 个 menu id(seed 重置后 id 不再是 1-8)
    const listRes = await request(app.getHttpServer())
      .get('/api/menus')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const listBody = listRes.body as { data: { id: number }[] };
    const menuIds = listBody.data.slice(0, 8).map((m) => m.id);
    const res = await request(app.getHttpServer())
      .put('/api/roles/3/menus')
      .set('Authorization', `Bearer ${token}`)
      .send({ menuIds })
      .expect(200);
    const body = res.body as { code: number };
    expect(body.code).toBe(0);
  });

  it('5) admin GET /api/menus/tree 返 5+ 根', async () => {
    const token = await login(app, 'admin', 'Admin@123');
    const res = await request(app.getHttpServer())
      .get('/api/menus/tree')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: number; data: unknown[] };
    expect(body.code).toBe(0);
    expect(Array.isArray(body.data)).toBe(true);
    // 5 根目录:系统/AI/内容/业务/监控(允许更多,至少 5)
    expect(body.data.length).toBeGreaterThanOrEqual(5);
  });

  it('6) agent01 GET /api/users 仅看到自己(dataScope=3)', async () => {
    const token = await login(app, 'agent01', 'Agent@123');
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    // dataScope=3 本人,只能看到自己
    expect(body.data.total).toBe(1);
  });

  it('7) agent01 POST /api/users 无权限(user:create 缺失)→ 10101', async () => {
    const token = await login(app, 'agent01', 'Agent@123');
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'hack01_e2e',
        password: 'Hack@123',
        roleIds: [3],
      });
    // guard 抛 BizException → http 200 + code 10101
    const body = res.body as { code: number; message: string };
    expect(body.code).toBe(10101);
  });

  it('8) agent_lead01 GET /api/users 可看到多个用户(dataScope=2/1)', async () => {
    const token = await login(app, 'agent_lead01', 'Lead@123');
    const res = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    // dataScope=2 本部门(部门10),应看到 admin 同部门(若 admin deptId=10) + agent_lead01 + agent01
    expect(body.data.total).toBeGreaterThan(1);
  });

  it('9) admin DELETE /api/users/:id 软删', async () => {
    const adminToken = await login(app, 'admin', 'Admin@123');
    // 用 unique 名(timestamp 后缀,防重跑冲突)
    const uniqueName = `to_delete_e2e_${Date.now()}`;
    // 先创
    const createRes = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: uniqueName,
        password: 'Test@123',
        nickname: '待删',
        roleIds: [3],
      })
      .expect(200);
    const createBody = createRes.body as { data: { id: number } | null };
    expect(createBody.data).not.toBeNull();
    const userId = createBody.data!.id;
    // 删
    const delRes = await request(app.getHttpServer())
      .delete(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const delBody = delRes.body as { code: number };
    expect(delBody.code).toBe(0);
    // 列表中应不再出现
    const listRes = await request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = listRes.body as { data: { list: { id: number }[] } };
    const ids = listBody.data.list.map((u) => u.id);
    expect(ids).not.toContain(userId);
  });
});
