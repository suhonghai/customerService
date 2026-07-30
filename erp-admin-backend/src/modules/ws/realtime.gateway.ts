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

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(socket: Socket) {
    const sessionKey = (socket.handshake.auth as any)?.sessionKey;
    if (!sessionKey) {
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