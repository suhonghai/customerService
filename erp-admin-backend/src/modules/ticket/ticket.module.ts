import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { WsModule } from '../ws/ws.module';

/**
 * TicketModule(Day 7)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - AuditLogModule(@Global,AuditLogService)
 * - DataScopeModule(@Global,DataScopeService)
 *
 * 接口:
 * - GET    /api/tickets          列表(分页 + 筛选 + DataScope)
 * - GET    /api/tickets/stats    看板(5 个数字)
 * - GET    /api/tickets/:id      详情(含 logs)
 * - POST   /api/tickets          创建(自动 ticketNo + SLA deadline)
 * - PUT    /api/tickets/:id/assign    分配(改 status=2)
 * - PUT    /api/tickets/:id/status    状态变更(状态机)
 * - POST   /api/tickets/:id/reply     回复(只写 log)
 * - GET    /api/tickets/:id/logs      流转日志(只读)
 */
@Module({
  imports: [WsModule],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
