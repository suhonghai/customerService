import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

/**
 * SessionModule(Day 8)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - AuditLogModule(@Global,AuditLogService)
 * - DataScopeModule(@Global,DataScopeService)
 *
 * 接口:
 * - GET    /api/sessions              列表
 * - GET    /api/sessions/:id          详情
 * - GET    /api/sessions/:id/messages 消息分页
 * - DELETE /api/sessions/:id          软删
 */
@Module({
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
