/**
 * @change-id cs-round-068
 *
 * cs-round-068:FAQ `/publish` `/offline` 别名路由(2026-08-19)
 *
 * Why:
 * 运营后台用户报告 `POST /api/faq/3/publish` 报错,实际是 NestJS 404 Not Found。
 * 根因:前端 hook (`use-faqs.ts:152`) 拼 URL 用 `${id}/${action}` 直接调 `/publish` 和
 * `/offline`,但后端 controller 只有 `POST /:id/review` 一个审核入口(发布/下线通过 body
 * 的 `status` 区分)。前端 spec 还在断言 `/publish` / `/offline` 是 GREEN,后端测试只覆盖
 * `/review`,spec ↔ code 双向漂移。
 *
 * 修复方案(2026-08-19 选 B):后端加 `POST /:id/publish` 和 `POST /:id/offline` 两条
 * 别名路由,内部自动 query 最新 versionId → 构造 `ReviewFaqDto` 调现有 `review()`。
 * 复用 review 的状态机校验(自动继承 STATE_NOT_ALLOW 等错误码)+ Chroma 切片/embed/
 * 删除 + audit log。**没有重复业务逻辑**,符合反抽象原则。
 *
 * 这个 spec 守门 3 个 Scenario:
 *  1. /publish happy path:空 body 自动选最新 version → 200,status=2,chunkCount>0
 *     + Chroma count 实际增加
 *  2. /publish 重复发布已发布版本 → 状态机拒(SUCCESS≠0, code=STATE_NOT_ALLOW=40003)
 *     验证别名路由**完整复用** review 的状态机校验,没有偷偷放开限制
 *  3. /offline 下线已发布版本 → 200,chunkCount=0 + Chroma 实际被删(查 docId → 0 ids)
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import request from 'supertest';
import { ChromaClient } from 'chromadb';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

const STATE_NOT_ALLOW = 40003; // BizCode.STATE_NOT_ALLOW

const TEST_CONTENT = `# cs-round-068 FAQ 测试

## 退款政策

购买 7 天内无理由退款,商品需保持完好。

## 物流时效

下单后 24h 内发货,正常 2-3 天送达。
`;
const TEST_FILE = '/tmp/e2e-cs-round-068.md';

const loginAndGetToken = async (
  app: INestApplication,
  username: string,
  password: string,
): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username, password })
    .expect(200);
  const body = res.body as { code: number; data: { accessToken: string } };
  expect(body.code).toBe(0);
  return body.data.accessToken;
};

describe('cs-round-068: FAQ /publish /offline 别名路由', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let docId = 0;
  let versionId = 0;

  const uniqueTag = `cs-round-068-${Date.now()}`;

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
    app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
    fs.writeFileSync(TEST_FILE, TEST_CONTENT, 'utf-8');
  });

  afterAll(async () => {
    // 清理本测试创建的 faq 数据(file_meta + version + document + Chroma)
    try {
      if (docId > 0) {
        await prisma.$executeRawUnsafe(
          `DELETE FROM file_meta WHERE business_type = 'faq' AND business_id = ?`,
          String(docId),
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM faq_version WHERE document_id = ?`,
          docId,
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM faq_document WHERE id = ?`,
          docId,
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
          await col.delete({ where: { docId } });
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('afterAll cleanup failed:', e);
    }
    try {
      fs.unlinkSync(TEST_FILE);
    } catch {
      // ignore
    }
    await app.close();
  });

  // ── Given: admin token,建一个测试 FAQ 文档(v1 status=1 待审核) ──
  it('Given: admin 已登录 + 已上传新 FAQ 文档', async () => {
    adminToken = await loginAndGetToken(app, 'admin', 'Admin@123');
    expect(adminToken).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post('/api/faq/upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', `${uniqueTag}-doc`)
      .field('category', 'cs-round-068')
      .field('description', `cs-round-068 e2e ${uniqueTag}`)
      .attach('file', TEST_FILE)
      .expect(200);
    const body = res.body as {
      code: number;
      data: { documentId: number; versionId: number; status: number };
    };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe(1); // 待审核
    docId = body.data.documentId;
    versionId = body.data.versionId;
    expect(docId).toBeGreaterThan(0);
    expect(versionId).toBeGreaterThan(0);
  });

  // ── Scenario 1:/publish happy path(别名路由 + Chroma 入库) ──
  describe('Scenario 1: POST /api/faq/:id/publish 调通', () => {
    it('Then: 200,内部自动选最新 versionId,status=2,chunkCount>0,Chroma 入库', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/faq/${docId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { versionId: number; status: number; chunkCount: number };
      };
      expect(body.code).toBe(0);
      // 内部自动选了刚才 upload 的版本
      expect(body.data.versionId).toBe(versionId);
      expect(body.data.status).toBe(2);
      expect(body.data.chunkCount).toBeGreaterThan(0);

      // 等 Chroma 异步写入
      await new Promise((r) => setTimeout(r, 1500));

      const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
      const col = await chroma.getCollection({
        name: process.env.CHROMA_COLLECTION || 'erp_faq',
      });
      const chunks = await col.get({ where: { docId } });
      expect(chunks.ids.length).toBeGreaterThan(0);
    });
  });

  // ── Scenario 2:重复 /publish 已发布版本 → 状态机拒 ──
  describe('Scenario 2: POST /api/faq/:id/publish 重复发布已发布版本', () => {
    it('Then: 业务码 STATE_NOT_ALLOW(40003),message 含「只能下线」', async () => {
      // review 内部硬规则:status=2 已发布时,只能转 3 下线,其它(包括再 publish)拒
      const res = await request(app.getHttpServer())
        .post(`/api/faq/${docId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);
      // HTTP 仍 200(BizException 走全局 filter 统一返 200 + 业务码)
      expect(res.status).toBe(200);
      const body = res.body as { code: number; message: string };
      expect(body.code).toBe(STATE_NOT_ALLOW);
      expect(body.message).toMatch(/只能下线/);
    });
  });

  // ── Scenario 3:/offline happy path(状态 2 → 3,Chroma 删除) ──
  describe('Scenario 3: POST /api/faq/:id/offline 调通', () => {
    it('Then: 200,status=3,chunkCount=0,Chroma 该 docId 所有 chunk 被删', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/faq/${docId}/offline`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body = res.body as {
        code: number;
        data: { status: number; chunkCount: number };
      };
      expect(body.code).toBe(0);
      expect(body.data.status).toBe(3);
      expect(body.data.chunkCount).toBe(0);

      // 等 Chroma 异步删除
      await new Promise((r) => setTimeout(r, 1500));

      const chroma = new ChromaClient({
        host: '127.0.0.1',
        port: 8001,
        ssl: false,
      });
      const col = await chroma.getCollection({
        name: process.env.CHROMA_COLLECTION || 'erp_faq',
      });
      const remaining = await col.get({ where: { docId } });
      expect(remaining.ids.length).toBe(0);
    });
  });
});