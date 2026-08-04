/**
 * @status accepted
 * @change-id cs-round-007
 *
 * (注:本 spec 需 test DB + .env.test 才能跑;CI pr-e2e.yml 跑;本地跳过)
 *
 * cs-round-007:WebSocket 握手鉴权(e2e 验证)
 *
 * 背景:gateway 原本只读 sessionKey 查 DB 就放行,无 token / 无过期 / 无吊销。
 * 修法:加 INTERNAL_TOKEN 校验,token 错或缺 socket.disconnect(true) 立即拒绝。
 *
 * 4 个 scenario 覆盖完整契约:
 *   1. 无 token → connect 失败(disconnect)
 *   2. 错 token → connect 失败(disconnect)
 *   3. 正确 token + 无 sessionKey → connect 失败(原有 sessionKey 校验仍生效)
 *   4. 正确 token + 有效 sessionKey → connect 成功,加入对应 room
 *
 * 落点:backend/test/cs-round-007.e2e-spec.ts(jest + socket.io client +
 * 真实 test DB,验证 server-side 协议行为)
 */

import { io, Socket } from 'socket.io-client';
import { PrismaService } from '../src/prisma/prisma.service';

describe('cs-round-007: WebSocket 握手鉴权', () => {
  let prisma: PrismaService;
  const internalToken = process.env.INTERNAL_TOKEN ?? '';
  const backendPort = parseInt(process.env.BACKEND_PORT ?? '3001', 10);
  const wsUrl = `http://localhost:${backendPort}`;

  beforeAll(async () => {
    // PrismaService 不直接连 — 测试只依赖 socket.io client。
    // 这里简单 init 以确保测试 DB 可达(用于创建 session)
    if (!internalToken) throw new Error('INTERNAL_TOKEN not set');
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient() as unknown as PrismaService;
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 通用 helper:等 socket 触发 connect_error / disconnect 事件
  function waitForRejection(socket: Socket, timeoutMs = 3000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      socket.on('connect_error', () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.on('disconnect', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
  }

  // ── Scenario 1:无 token → connect 失败 ─
  describe('Given: handshake auth 缺 token 字段', () => {
    it('Then: socket.io 拒绝连接(disconnect)', async () => {
      const socket = io(`${wsUrl}/realtime`, {
        auth: { sessionKey: 'any-session-key' }, // 没有 token
        transports: ['websocket'],
        reconnection: false,
      });
      const rejected = await waitForRejection(socket);
      socket.disconnect();
      expect(rejected).toBe(true);
    });
  });

  // ── Scenario 2:错 token → connect 失败 ─
  describe('Given: handshake auth.token 是错误值', () => {
    it('Then: socket.io 拒绝连接', async () => {
      const socket = io(`${wsUrl}/realtime`, {
        auth: { sessionKey: 'any-session-key', token: 'wrong-token-value' },
        transports: ['websocket'],
        reconnection: false,
      });
      const rejected = await waitForRejection(socket);
      socket.disconnect();
      expect(rejected).toBe(true);
    });
  });

  // ── Scenario 3:正确 token + 无 sessionKey → connect 失败 ─
  describe('Given: 正确 token 但 sessionKey 在 DB 里不存在', () => {
    it('Then: socket.io 拒绝连接(sessionKey 校验仍生效)', async () => {
      const socket = io(`${wsUrl}/realtime`, {
        auth: {
          sessionKey: `e2e-nonexistent-${Date.now()}`,
          token: internalToken,
        },
        transports: ['websocket'],
        reconnection: false,
      });
      const rejected = await waitForRejection(socket);
      socket.disconnect();
      expect(rejected).toBe(true);
    });
  });

  // ── Scenario 4:正确 token + 有效 sessionKey → connect 成功 ─
  describe('Given: 正确 token + DB 里存在的 sessionKey', () => {
    const sessionKey = `e2e-cs-round-007-s4-${Date.now()}`;
    let socket: Socket | null = null;

    beforeAll(async () => {
      await prisma.csSession.upsert({
        where: { sessionKey },
        update: {},
        create: { sessionKey, visitorId: 'e2e-v-cs-round-007', messageCount: 0 },
      });
    });

    afterAll(() => {
      socket?.disconnect();
    });

    it('When: 发起 WS 连接', async () => {
      socket = io(`${wsUrl}/realtime`, {
        auth: { sessionKey, token: internalToken },
        transports: ['websocket'],
        reconnection: false,
      });

      // 等 connect 或 reject
      const connected = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        socket!.on('connect', () => {
          clearTimeout(timer);
          resolve(true);
        });
        socket!.on('connect_error', () => {
          clearTimeout(timer);
          resolve(false);
        });
      });

      expect(connected).toBe(true);
      expect(socket!.connected).toBe(true);
    });
  });
});