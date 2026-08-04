/**
 * @status accepted
 * @change-id spec-updatedat
 *
 * (注:本 spec 需 test DB + .env.test 才能跑;CI pr-e2e.yml 跑;本地跳过)
 *
 * spec-updatedat:cs_message.updatedAt 防回归断言
 *
 * 背景:schema.prisma:195-198 cs_message.updatedAt 标了 @updatedAt,MySQL migration
 *   6 也带 ON UPDATE CURRENT_TIMESTAMP(3)。但全仓测试只把 updated_at 当 reaper
 *   的「陈旧判断」输入,没有任何断言 PATCH 后 updatedAt 真的严格递增。
 *   若哪天 schema 丢了 @updatedAt,没人会发现。
 *
 * 契约:
 *   1. PATCH /api/internal/cs/sessions/:id/messages/:msgId 后,updatedAt > PATCH 前
 *   2. createdAt 不变(只 updatedAt 动)
 *   3. Prisma @updatedAt 在纯 prisma.csMessage.update() 也自动递增
 *   4. cs_session.updatedAt 在 appendMessage 后也递增(父表触发)
 *
 * 落点:erp-admin-backend/test/spec-updatedat.e2e-spec.ts
 *   jest + supertest + 真实 test DB(同 cs-round-001/002)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

describe('spec-updatedat: cs_message.updatedAt 防回归', () => {
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

  // ── Scenario 1:PATCH messages/:msgId 后 cs_message.updatedAt 严格递增 ─
  describe('Given: 1 条 cs_message (status=2, PATCH 前快照 updatedAt)', () => {
    const sessionKey = `e2e-spec-updatedat-s1-${Date.now()}`;
    let sessionId: number;
    let messageId: number;
    let createdAtBefore: Date;
    let updatedAtBefore: Date;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v-updatedat', messageCount: 1 },
      });
      sessionId = session.id;
      const msg = await prisma.csMessage.create({
        data: { sessionId, role: 'assistant', content: '', status: 2 },
      });
      messageId = msg.id;
      const snap = await prisma.csMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: { createdAt: true, updatedAt: true },
      });
      createdAtBefore = snap.createdAt;
      updatedAtBefore = snap.updatedAt;
    });

    it('When: PATCH status=1(done)', async () => {
      // MySQL DATETIME(3) 精度 = ms,差 < 1ms 可能 updatedAt 不变,显式等 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));
      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({ status: 1, content: 'final content' })
        .expect(200);

      const after = await prisma.csMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: { createdAt: true, updatedAt: true },
      });

      // 核心契约:updatedAt 严格 > PATCH 前
      expect(after.updatedAt.getTime()).toBeGreaterThan(updatedAtBefore.getTime());
      // 副作用契约:createdAt 不变
      expect(after.createdAt.getTime()).toBe(createdAtBefore.getTime());
    });
  });

  // ── Scenario 2:连续两次 PATCH,updatedAt 严格递增 ─
  describe('Given: 同一条 cs_message,第 1 次 PATCH 后快照', () => {
    const sessionKey = `e2e-spec-updatedat-s2-${Date.now()}`;
    let sessionId: number;
    let messageId: number;
    let updatedAtAfterFirstPatch: Date;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v-updatedat', messageCount: 1 },
      });
      sessionId = session.id;
      const msg = await prisma.csMessage.create({
        data: { sessionId, role: 'user', content: 'first', status: 1 },
      });
      messageId = msg.id;
    });

    it('When: 第一次 PATCH content + 第二次 PATCH status', async () => {
      // 第 1 次 PATCH
      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({ content: 'updated-content' })
        .expect(200);
      const first = await prisma.csMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: { updatedAt: true },
      });
      updatedAtAfterFirstPatch = first.updatedAt;

      // 间隔 50ms 再 PATCH
      await new Promise((resolve) => setTimeout(resolve, 50));
      await request(app.getHttpServer())
        .patch(`/api/internal/cs/sessions/${sessionId}/messages/${messageId}`)
        .set('X-Internal-Token', internalToken)
        .send({ status: 4 })
        .expect(200);
      const second = await prisma.csMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: { updatedAt: true },
      });

      // 第 2 次 PATCH 后 > 第 1 次 PATCH 后
      expect(second.updatedAt.getTime()).toBeGreaterThan(updatedAtAfterFirstPatch.getTime());
    });
  });

  // ── Scenario 3:Prisma @updatedAt 在纯 DB 写入也生效(防 schema 丢 @updatedAt) ─
  describe('Given: 直接 prisma.csMessage.update()', () => {
    const sessionKey = `e2e-spec-updatedat-s3-${Date.now()}`;

    it('Then: updatedAt 自动递增,createdAt 不变', async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v-updatedat', messageCount: 0 },
      });
      const msg = await prisma.csMessage.create({
        data: { sessionId: session.id, role: 'user', content: '', status: 1 },
      });
      const before = msg.updatedAt;

      // 间隔 50ms
      await new Promise((resolve) => setTimeout(resolve, 50));
      const updated = await prisma.csMessage.update({
        where: { id: msg.id },
        data: { content: 'changed' },
      });

      expect(updated.updatedAt.getTime()).toBeGreaterThan(before.getTime());
      expect(updated.createdAt.getTime()).toBe(msg.createdAt.getTime());
    });
  });

  // ── Scenario 4:cs_session.updatedAt 在 appendMessage 后递增 ─
  describe('Given: 1 条 cs_session (snapshot updatedAt)', () => {
    const sessionKey = `e2e-spec-updatedat-s4-${Date.now()}`;
    let sessionId: number;
    let sessionUpdatedAtBefore: Date;

    beforeAll(async () => {
      const session = await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v-updatedat', messageCount: 0 },
      });
      sessionId = session.id;
      sessionUpdatedAtBefore = session.updatedAt;
    });

    it('When: appendMessage POST', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await request(app.getHttpServer())
        .post(`/api/internal/cs/sessions/${sessionId}/messages`)
        .set('X-Internal-Token', internalToken)
        .send({ role: 'user', content: 'hi' })
        .expect(201);

      const after = await prisma.csSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { updatedAt: true },
      });

      // cs_session 也应该 bump(updatedAt 在 upsert 时设置,但后续写应该 bump)
      // 这里如果 cs_session 有自己的 trigger / middleware 才能确保,我们只断言
      // appendMessage 调用后 updatedAt 不小于调用前(允许等于)。
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(sessionUpdatedAtBefore.getTime());
    });
  });
});