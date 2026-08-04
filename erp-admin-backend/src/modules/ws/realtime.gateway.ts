import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * RealtimeGateway — /realtime 命名空间
 *
 * 握手鉴权(2026-08-04 cs-round-007,#24):
 *   客户端 handshake.auth 必须带 sessionKey + token。
 *   token 必须等于 env.INTERNAL_TOKEN(同 internal HTTP API 的 server-to-server token)。
 *   缺 token / token 错 → disconnect(true) 立即拒绝,不进入 sessionKey 校验。
 *   sessionKey 不存在 → 同上拒绝。
 *
 * Why INTERNAL_TOKEN(不是 JWT):
 *   - ai-cs-demo 是 WS 唯一客户端,跟 internal HTTP API 共享同一 token 即可
 *   - 复用既有 INTERNAL_TOKEN env,前端无需新增 secret 管理
 *   - JWT 适合 C 端 user 认证,但 ai-cs-demo 是 B 端 server-to-server,INTERNAL_TOKEN
 *     已足够 + 比 JWT 简单
 *
 * Future:如果未来加 C 端 user 直连 WS(不经 ai-cs-demo),可在此加 JWT 校验
 * 作为第二因子。当前不阻塞。
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
  // W11 S-A:启用 socket.io v4.6+ connectionStateRecovery
  // client 断线后能在 maxDisconnectionDuration 内重连,server 自动 resend 未确认的包
  // 这样 5 分钟内 reconnect:client sock.recovered === true,业务层不需要手动补
  // 5 分钟外 reconnect:S2 前端 refetchSessionHistory 兜底
  connectionStateRecovery: { maxDisconnectionDuration: 5 * 60 * 1000 }, // 5 分钟
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  // Map socket.id → cs_session.id for cleanup on disconnect
  private socketToSession = new Map<string, number>();

  // cs-round-007:cache INTERNAL_TOKEN env,避免每次 connect 都重读 process.env
  private readonly expectedToken = process.env.INTERNAL_TOKEN ?? '';

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(socket: Socket) {
    const auth = (socket.handshake.auth as { sessionKey?: unknown; token?: unknown }) ?? {};

    // ── 1. token 校验(cs-round-007) ── 必须先于 sessionKey,避免无 token
    // 的连接走 DB 查询(防 DoS)
    if (typeof auth.token !== 'string' || auth.token === '') {
      this.logger.warn(`socket ${socket.id} missing token, disconnect`);
      socket.disconnect(true);
      return;
    }
    if (!this.expectedToken || auth.token !== this.expectedToken) {
      this.logger.warn(`socket ${socket.id} bad token, disconnect`);
      socket.disconnect(true);
      return;
    }

    // ── 2. sessionKey 校验(原有逻辑) ──
    const sessionKey = auth.sessionKey;
    if (typeof sessionKey !== 'string' || sessionKey === '') {
      this.logger.warn(`socket ${socket.id} no sessionKey, disconnect`);
      socket.disconnect(true);
      return;
    }
    const session = await this.prisma.csSession.findUnique({
      where: { sessionKey },
      select: { id: true },
    });
    if (!session) {
      this.logger.warn(`socket ${socket.id} unknown sessionKey=${sessionKey}, disconnect`);
      socket.disconnect(true);
      return;
    }
    await socket.join(`session:${session.id}`);
    this.socketToSession.set(socket.id, session.id);
    this.logger.log(`socket ${socket.id} joined session:${session.id}`);
  }

  async handleDisconnect(socket: Socket) {
    const sid = this.socketToSession.get(socket.id);
    if (sid) {
      this.socketToSession.delete(socket.id);
      this.logger.log(`socket ${socket.id} left session:${sid}`);
    }
  }

  // Test helper — admin or ai-cs-demo can ping
  @SubscribeMessage('ping')
  ping(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    return { pong: true, ts: Date.now(), ...data };
  }
}
