import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

/**
 * OrderModule(Day 6)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - AuditLogModule(@Global,AuditLogService)
 * - DataScopeModule(@Global,DataScopeService)
 */
@Module({
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}