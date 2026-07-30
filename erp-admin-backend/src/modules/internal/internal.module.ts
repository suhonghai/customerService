import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { InternalService } from './internal.service';
import { FaqModule } from '../faq/faq.module';
import { TicketModule } from '../ticket/ticket.module';
import { WsModule } from '../ws/ws.module';

/**
 * InternalModule(Day 9 + Day 10 escalation + Day 11 shared-thread)
 *
 * 9 个内部 API,供 ai-cs-demo / erp-admin 同机调用:
 * - GET    /api/internal/cs/ai-config/active
 * - GET    /api/internal/cs/faq/search
 * - POST   /api/internal/cs/sessions
 * - POST   /api/internal/cs/sessions/:id/messages
 * - GET    /api/internal/cs/orders/:orderNo
 * - POST   /api/internal/cs/tickets
 * - POST   /api/internal/cs/escalations
 * - GET    /api/internal/cs/sessions/:id/open-ticket   (Day 11)
 * - POST   /api/internal/cs/tickets/:id/messages       (Day 11)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - FaqModule(提供 FaqChromaService)
 * - CommonServicesModule(@Global,EmbeddingService)
 * - TicketModule(提供 TicketService.reply bridge,用于 operator message)
 * - WsModule(提供 RealtimeGateway,用于 emit user_message)
 */
@Module({
  imports: [FaqModule, TicketModule, WsModule],
  controllers: [InternalController],
  providers: [InternalService],
  exports: [InternalService],
})
export class InternalModule {}
