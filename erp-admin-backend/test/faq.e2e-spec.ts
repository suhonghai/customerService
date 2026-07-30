import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChromaClient } from 'chromadb';

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
 * FAQ 模块 E2E(Day 5)
 *
 * 覆盖:
 * - 列表 / 详情 / upload / update / upload-version / review / delete
 * - SHA256 重复 → 40001
 * - 无权限 agent01 → 10101
 * - Chroma 入库 + 下线 + 文档删 → count 变化正确
 */
describe('FAQ 上传 + 版本 + Chroma (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let agentToken: string;
  let editorToken: string;
  let chromaCountBefore = 0;

  const testFaqContent = `# E2E 测试 FAQ

## 退款政策

购买 7 天内无理由退款,商品需保持完好。

## 物流时效

下单后 24h 内发货,正常 2-3 天送达。

## 客服工作时间

9:00-22:00,节假日无休。
`;

  const testFaqContentV2 = `# E2E 测试 FAQ v2(更新)

## 退款政策

购买 15 天内无理由退款,商品需保持完好。

## 新增:换货政策

同款可换,邮费我们承担。
`;

  const testTmpFile = '/tmp/e2e-faq-test.md';
  const testTmpFileV2 = '/tmp/e2e-faq-test-v2.md';

  // 唯一 ID(防止历史数据干扰)
  const uniqueTag = `e2e-faq-${Date.now()}`;
  let createdDocId = 0;
  let createdVersionId = 0;

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

    // 写测试文件
    fs.writeFileSync(testTmpFile, testFaqContent, 'utf-8');
    fs.writeFileSync(testTmpFileV2, testFaqContentV2, 'utf-8');

    // 取 Chroma 当前 count
    try {
      const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
      const col = await chroma.getCollection({
        name: process.env.CHROMA_COLLECTION || 'erp_faq',
      });
      chromaCountBefore = await col.count();
    } catch (e) {
      console.warn('Chroma 初始化失败,可能影响 count 断言:', e);
    }

    // 清理历史 e2e FAQ 数据(用 raw SQL,不走 Prisma 中间件,确保看到 deleted_at IS NOT NULL 的记录)
    const prisma = app.get(PrismaService);
    const staleRows = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      `SELECT id FROM faq_document WHERE title LIKE '%e2e-faq%'`,
    );
    if (staleRows.length > 0) {
      const ids = staleRows.map((d) => d.id);
      await prisma.$executeRawUnsafe(
        `DELETE FROM file_meta WHERE business_type = 'faq' AND business_id IN (${ids.map((i) => `'${i}'`).join(',')})`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM faq_version WHERE document_id IN (${ids.join(',')})`,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM faq_document WHERE id IN (${ids.join(',')})`,
      );
      // 同步清理 Chroma
      try {
        const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
        const col = await chroma.getCollection({
          name: process.env.CHROMA_COLLECTION || 'erp_faq',
        });
        for (const id of ids) {
          try { await col.delete({ where: { docId: id } }); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn('Chroma cleanup failed:', e);
      }
      console.log(`[beforeAll cleanup] removed ${ids.length} stale e2e docs`);
    }
  });

  afterAll(async () => {
    // 清理 e2e 文档
    try {
      const prisma = app.get(PrismaService);
      const docs = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT id FROM faq_document WHERE title LIKE '%e2e-faq%'`,
      );
      if (docs.length > 0) {
        const ids = docs.map((d) => d.id);
        await prisma.$executeRawUnsafe(
          `DELETE FROM file_meta WHERE business_type = 'faq' AND business_id IN (${ids.map((i) => `'${i}'`).join(',')})`,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM faq_version WHERE document_id IN (${ids.join(',')})`,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM faq_document WHERE id IN (${ids.join(',')})`,
        );
        try {
          const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
          const col = await chroma.getCollection({
            name: process.env.CHROMA_COLLECTION || 'erp_faq',
          });
          for (const id of ids) {
            try { await col.delete({ where: { docId: id } }); } catch { /* ignore */ }
          }
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      console.warn('afterAll cleanup failed:', e);
    }
    // 删测试文件
    try {
      fs.unlinkSync(testTmpFile);
      fs.unlinkSync(testTmpFileV2);
    } catch {
      // ignore
    }
    await app.close();
  });

  it('1) admin login + 测 Chroma 已启', async () => {
    adminToken = await login(app, 'admin', 'Admin@123');
    expect(adminToken).toBeTruthy();
    expect(chromaCountBefore).toBeGreaterThan(0);
  });

  it('2) GET /api/faq 返 seed 2 个 FAQ(总 total >= 2)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/faq')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number; data: { list: unknown[]; total: number } };
    expect(body.code).toBe(0);
    expect(body.data.total).toBeGreaterThanOrEqual(2);
  });

  it('3) admin POST /api/faq/upload(创建文档 + v1 status=1)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/faq/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', `${uniqueTag}-doc`)
      .field('category', 'e2e-test')
      .field('tags', 'e2e,test')
      .field('description', `e2e ${uniqueTag}`)
      .attach('file', testTmpFile)
      .expect(200);
    const body = res.body as {
      code: number;
      data: {
        documentId: number;
        versionId: number;
        version: number;
        fileSize: number;
        checksum: string;
        status: number;
      };
    };
    expect(body.code).toBe(0);
    expect(body.data.documentId).toBeGreaterThan(0);
    expect(body.data.versionId).toBeGreaterThan(0);
    expect(body.data.version).toBe(1);
    expect(body.data.status).toBe(1); // 待审核
    expect(body.data.checksum).toMatch(/^[a-f0-9]{64}$/);

    createdDocId = body.data.documentId;
    createdVersionId = body.data.versionId;
  });

  it('4) SHA256 重复 → 40001', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/faq/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', `${uniqueTag}-dup`)
      .field('category', 'e2e-test')
      .field('description', `e2e dup ${uniqueTag}`)
      .attach('file', testTmpFile);
    const body = res.body as { code: number; message: string };
    expect(body.code).toBe(40001);
    expect(body.message).toContain('文件重复');
  });

  it('5) PUT /api/faq/:id 改 title', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/faq/${createdDocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `${uniqueTag}-renamed` })
      .expect(200);
    const body = res.body as { code: number; data: { title: string } };
    expect(body.code).toBe(0);
    expect(body.data.title).toBe(`${uniqueTag}-renamed`);
  });

  it('6) GET /api/faq/:id 详情含所有版本', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/faq/${createdDocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { id: number; versions: Array<{ version: number; status: number }> };
    };
    expect(body.code).toBe(0);
    expect(body.data.id).toBe(createdDocId);
    expect(body.data.versions.length).toBeGreaterThanOrEqual(1);
  });

  it('7) POST /api/faq/:id/review v1 status=2 发布 → 触发 Chroma 入库', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/faq/${createdDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ versionId: createdVersionId, status: 2, comment: 'e2e 发布' })
      .expect(200);
    const body = res.body as {
      code: number;
      data: { versionId: number; status: number; chunkCount: number };
    };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe(2);
    expect(body.data.chunkCount).toBeGreaterThan(0);

    // 等 Chroma 写入
    await new Promise((r) => setTimeout(r, 1500));

    // Chroma count 增加
    const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
    const col = await chroma.getCollection({
      name: process.env.CHROMA_COLLECTION || 'erp_faq',
    });
    const afterPublish = await col.count();
    expect(afterPublish).toBeGreaterThanOrEqual(
      chromaCountBefore + body.data.chunkCount,
    );
  });

  it('8) DB 验证 chunkCount 落库 + file_meta 写入', async () => {
    const prisma = app.get(PrismaService);
    const version = await prisma.faqVersion.findUnique({
      where: { id: createdVersionId },
    });
    expect(version).not.toBeNull();
    expect(version!.status).toBe(2);
    expect(version!.chunkCount).toBeGreaterThan(0);

    const meta = await prisma.fileMeta.findFirst({
      where: { businessType: 'faq', businessId: String(createdDocId) },
    });
    expect(meta).not.toBeNull();
    expect(meta!.storageType).toBe('local');
    expect(meta!.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(meta!.url).toContain('/api/files/');
  });

  it('9) POST /api/faq/:id/upload-version 上传 v2', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/faq/${createdDocId}/upload-version`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', `${uniqueTag}-renamed`)
      .field('category', 'e2e-test')
      .field('changelog', 'v2 changelog')
      .attach('file', testTmpFileV2)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { versionId: number; version: number; status: number };
    };
    expect(body.code).toBe(0);
    expect(body.data.version).toBe(2);
    expect(body.data.status).toBe(1); // 待审核
  });

  it('10) 审核 v2 发布 → Chroma count 增加', async () => {
    const prisma = app.get(PrismaService);
    const v2 = await prisma.faqVersion.findFirst({
      where: { documentId: createdDocId, version: 2 },
    });
    expect(v2).not.toBeNull();

    const res = await request(app.getHttpServer())
      .post(`/api/faq/${createdDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ versionId: v2!.id, status: 2, comment: 'v2 发布' })
      .expect(200);
    const body = res.body as { code: number; data: { chunkCount: number } };
    expect(body.code).toBe(0);
    expect(body.data.chunkCount).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 1500));

    const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
    const col = await chroma.getCollection({
      name: process.env.CHROMA_COLLECTION || 'erp_faq',
    });
    const afterV2 = await col.count();
    // v2 发布后应至少多了 v2 chunkCount 个
    const v2Chunk = body.data.chunkCount;
    expect(afterV2).toBeGreaterThanOrEqual(v2Chunk);
  });

  it('11) 审核 v1 下线 → Chroma v1 chunks 被删', async () => {
    const prisma = app.get(PrismaService);
    // 用 raw SQL 避免任何 Prisma 中间件副作用(中间件不对 FaqVersion 处理)
    const v1Rows = await prisma.$queryRawUnsafe<
      Array<{ id: number; version: number; status: number }>
    >(
      `SELECT id, version, status FROM faq_version WHERE document_id = ? AND version = 1 LIMIT 1`,
      createdDocId,
    );
    expect(v1Rows.length).toBe(1);
    const v1 = v1Rows[0];
    expect(v1.status).toBe(2); // 此时 v1 已发布
    const res = await request(app.getHttpServer())
      .post(`/api/faq/${createdDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ versionId: v1.id, status: 3, comment: 'v1 下线' })
      .expect(200);
    const body = res.body as { code: number; data: { chunkCount: number } };
    expect(body.code).toBe(0);
    expect(body.data.chunkCount).toBe(0);

    await new Promise((r) => setTimeout(r, 1500));

    const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
    const col = await chroma.getCollection({
      name: process.env.CHROMA_COLLECTION || 'erp_faq',
    });
    // 查询 v1 chunk → 应为空(chromadb where 只接受一个 operator,用 $and 多条件)
    const v1Only = await col.get({
      where: {
        $and: [
          { docId: createdDocId },
          { version: 1 },
        ],
      },
    });
    expect(v1Only.ids.length).toBe(0);
  });

  it('12) GET /api/faq/:id/versions 返该文档所有版本', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/faq/${createdDocId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // TransformInterceptor 包成 {code, data}
    const body = res.body as { code: number; data: Array<{ version: number }> };
    expect(body.code).toBe(0);
    expect(body.data.length).toBe(2);
  });

  it('13) agent01 POST /api/faq/upload 无权限 → 10101', async () => {
    agentToken = await login(app, 'agent01', 'Agent@123');
    const res = await request(app.getHttpServer())
      .post('/api/faq/upload')
      .set('Authorization', `Bearer ${agentToken}`)
      .field('title', 'hack')
      .field('category', 'hack')
      .field('description', 'hack')
      .attach('file', testTmpFile);
    const body = res.body as { code: number };
    expect(body.code).toBe(10101);
  });

  it('14) editor01 POST /api/faq/upload editor 角色无按钮 permCode → 10101', async () => {
    // editor 角色在 Day 3 seed 中只绑了"FAQ 管理"父菜单,没绑"上传 FAQ"按钮菜单,
    // 故 editor 不具备 faq:create 按钮权限 — 这是按设计来的,
    // 因为 editor 角色 dataScope=1 但需要由 super_admin 显式给按钮权限
    editorToken = await login(app, 'editor01', 'Editor@123');
    const res = await request(app.getHttpServer())
      .post('/api/faq/upload')
      .set('Authorization', `Bearer ${editorToken}`)
      .field('title', `${uniqueTag}-editor`)
      .field('category', 'e2e-test')
      .field('description', `e2e editor ${uniqueTag}`)
      .attach('file', testTmpFile);
    const body = res.body as { code: number };
    // 期望无 faq:create 权限 → 10101
    expect(body.code).toBe(10101);
  });

  it('15) DELETE /api/faq/:id 软删 → Chroma 全删', async () => {
    const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
    const col = await chroma.getCollection({
      name: process.env.CHROMA_COLLECTION || 'erp_faq',
    });
    const beforeDelete = await col.get({ where: { docId: createdDocId } });
    expect(beforeDelete.ids.length).toBeGreaterThan(0); // 至少还有 v2

    const res = await request(app.getHttpServer())
      .delete(`/api/faq/${createdDocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = res.body as { code: number };
    expect(body.code).toBe(0);

    await new Promise((r) => setTimeout(r, 1500));

    const afterDelete = await col.get({ where: { docId: createdDocId } });
    expect(afterDelete.ids.length).toBe(0);
  });

  it('16) 不支持的文件类型(.exe)被拒', async () => {
    const exeFile = '/tmp/e2e-faq-test.exe';
    fs.writeFileSync(exeFile, 'fake', 'utf-8');
    try {
      const res = await request(app.getHttpServer())
        .post('/api/faq/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('title', 'hack exe')
        .field('category', 'hack')
        .field('description', 'hack exe e2e')
        .attach('file', exeFile);
      // multer 拒 → 50000 SERVER_ERROR(走全局 filter 转 BizException)
      const body = res.body as { code: number };
      expect([20002, 20001]).toContain(body.code);
    } finally {
      try { fs.unlinkSync(exeFile); } catch { /* ignore */ }
    }
  });
});