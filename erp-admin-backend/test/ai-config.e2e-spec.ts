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

describe('AI Config + Prompt Template + Audit Log Query (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  const testCode = `e2e_test_${Date.now()}`;

  // Day 9 修:Bug #1 — set-default 测试会改默认,跑完必须还原
  let defaultSnapshot: { id: number; code: string } | null = null;

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

    // 清理历史 e2e 测试数据
    const prisma = app.get(PrismaService);
    const stale = await prisma.aiModelConfig.findMany({
      where: { code: { startsWith: 'e2e_test_' } },
      select: { id: true },
    });
    if (stale.length > 0) {
      const ids = stale.map((r) => r.id);
      await prisma.$executeRawUnsafe(
        `DELETE FROM ai_model_config WHERE id IN (${ids.join(',')})`,
      );
    }

    // Day 9 修:Bug #1 — 快照当前默认 config 的 id,afterAll 还原
    const cur = await prisma.aiModelConfig.findFirst({
      where: { isDefault: true, deletedAt: null },
      select: { id: true, code: true },
    });
    defaultSnapshot = cur;
  });

  afterAll(async () => {
    // Day 9 修:Bug #1 — 还原默认 config
    if (defaultSnapshot) {
      const prisma = app.get(PrismaService);
      await prisma.$transaction([
        prisma.aiModelConfig.updateMany({
          where: { deletedAt: null },
          data: { isDefault: false },
        }),
        prisma.aiModelConfig.update({
          where: { id: defaultSnapshot.id },
          data: { isDefault: true },
        }),
      ]);
    }
    await app.close();
  });

  it('1) admin login + GET /api/ai-configs(返 seed 的 qwen3.7-plus)', async () => {
    adminToken = await login(app, 'admin', 'Admin@123');
    const res = await request(app.getHttpServer())
      .get('/api/ai-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: Array<{ code: string; provider: string; apiKey: string }>; total: number };
    };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(1);
    const first = body.data.list[0];
    expect(first.code).toBeTruthy();
    expect(first.provider).toBe('dashscope');
    // 脱敏:apiKey 不是密文全串,也不是明文,而是 mask
    expect(first.apiKey).toMatch(/^sk-|^[*a-z-]+$/); // 包含脱敏标记或 4-4-4-4 模式
    expect(first.apiKey.length).toBeLessThan(50);
  });

  it('2) admin POST /api/ai-configs 创建测试配置(API key 加密入库)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/ai-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: testCode,
        name: 'E2E 测试配置',
        provider: 'dashscope',
        modelId: 'qwen-turbo',
        apiKey: 'sk-e2e-test-fake-key-for-encryption-test',
        temperature: 0.5,
        maxTokens: 500,
      })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { id: number; code: string; apiKey: string };
    };
    expect(body.code).toBe(0);
    expect(body.data.code).toBe(testCode);
    // 返回的 apiKey 是脱敏的(**** 形式)
    expect(body.data.apiKey).toContain('****');
    // 不应该是原始明文
    expect(body.data.apiKey).not.toContain('sk-e2e-test-fake-key-for-encryption-test');

    // DB 验证加密
    const prisma = app.get(PrismaService);
    const dbRow = await prisma.aiModelConfig.findUnique({
      where: { id: body.data.id },
    });
    expect(dbRow).not.toBeNull();
    // apiKey 在 DB 中是密文:iv:tag:cipher
    expect(dbRow!.apiKey).toContain(':');
    expect(dbRow!.apiKey).not.toContain('sk-e2e-test-fake-key-for-encryption-test');
  });

  it('3) admin GET /api/ai-configs/active 返明文 apiKey', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai-configs/active')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { code: string; apiKey: string; modelId: string };
    };
    expect(body.code).toBe(0);
    expect(body.data.code).toBe('qwen3.7-plus');
    // active 返**明文**(供 ai-cs-demo 调)
    expect(body.data.apiKey.length).toBeGreaterThan(30);
    expect(body.data.apiKey).toMatch(/^sk-/);
  });

  it('4) admin POST /api/ai-configs/:id/set-default 切换默认', async () => {
    // 先找 e2e 测试配置的 id
    const prisma = app.get(PrismaService);
    const testCfg = await prisma.aiModelConfig.findUnique({
      where: { code: testCode },
    });
    expect(testCfg).not.toBeNull();
    const res = await request(app.getHttpServer())
      .post(`/api/ai-configs/${testCfg!.id}/set-default`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number };
    expect(body.code).toBe(0);
    // 验证 DB: 只有一个 isDefault=true
    const allDefaults = await prisma.aiModelConfig.findMany({
      where: { isDefault: true, deletedAt: null },
      select: { id: true, code: true },
    });
    expect(allDefaults.length).toBe(1);
    expect(allDefaults[0].code).toBe(testCode);
  });

  it('5) admin POST /api/ai-configs/:id/test(若 DASHSCOPE 真实,返 200 + tokens > 0)', async () => {
    const prisma = app.get(PrismaService);
    const testCfg = await prisma.aiModelConfig.findUnique({
      where: { code: testCode },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/ai-configs/${testCfg!.id}/test`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ prompt: '说 hello' })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { success: boolean; response: string; latencyMs: number; tokens: number; error?: string };
    };
    expect(body.code).toBe(0);
    if (body.data.success) {
      // 真实调通
      expect(body.data.response).toBeTruthy();
      expect(body.data.latencyMs).toBeGreaterThan(0);
      expect(body.data.tokens).toBeGreaterThan(0);
    } else {
      // key 无效 / 网络失败,记 warning(不算 fail)
      console.warn(`[test] DASHSCOPE 调用失败: ${body.data.error}`);
    }
  });

  it('6) admin GET /api/audit-logs 累计 10+ 条', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: unknown[]; total: number };
    };
    expect(body.code).toBe(0);
    // 累计:登录 + 之前的 user/role/menu + 这次 ai-config 写入,应 > 10
    expect(body.data.total).toBeGreaterThan(10);
  });

  it('7) admin GET /api/audit-logs/:id 返详情(含 oldValue / newValue)', async () => {
    // 先拿一个 id
    const listRes = await request(app.getHttpServer())
      .get('/api/audit-logs?pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = listRes.body as { data: { list: { id: number }[] } };
    const id = listBody.data.list[0].id;
    const res = await request(app.getHttpServer())
      .get(`/api/audit-logs/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { id: number } };
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(id);
  });

  it('8) GET /api/ai-prompt-templates 返 seed 2 个模板', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ai-prompt-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { list: Array<{ code: string }>; total: number };
    };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
    const codes = body.data.list.map((t) => t.code);
    expect(codes).toContain('customer_service');
    expect(codes).toContain('ticket_reply');
  });

  it('9) agent01 POST /api/ai-configs 无权限 → 10101', async () => {
    agentToken = await login(app, 'agent01', 'Agent@123');
    const res = await request(app.getHttpServer())
      .post('/api/ai-configs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        code: `hack_${Date.now()}`,
        name: 'hack',
        provider: 'dashscope',
        modelId: 'qwen-turbo',
        apiKey: 'sk-hack',
      });
    const body = res.body as { code: number; message: string };
    expect(body.code).toBe(10101);
  });

  it('10) agent01 GET /api/audit-logs 拒(仅 super_admin)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/audit-logs')
      .set('Authorization', `Bearer ${agentToken}`);
    const body = res.body as { code: number };
    expect(body.code).toBe(10101);
  });

  it('11) admin DELETE /api/ai-configs/:id 软删 e2e 测试配置', async () => {
    const prisma = app.get(PrismaService);
    const testCfg = await prisma.aiModelConfig.findUnique({
      where: { code: testCode },
    });
    const res = await request(app.getHttpServer())
      .delete(`/api/ai-configs/${testCfg!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number };
    expect(body.code).toBe(0);
    // 列表中应不再出现
    const listRes = await request(app.getHttpServer())
      .get('/api/ai-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const listBody = listRes.body as { data: { list: { code: string }[] } };
    const codes = listBody.data.list.map((c) => c.code);
    expect(codes).not.toContain(testCode);
  });
});
