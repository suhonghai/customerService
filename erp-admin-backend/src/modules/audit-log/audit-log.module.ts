import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditInterceptor } from './audit-log.interceptor';
import { AuditLogQueryService } from './audit-log-query.service';
import { AuditLogQueryController } from './audit-log-query.controller';

@Global()
@Module({
  controllers: [AuditLogQueryController],
  providers: [AuditLogService, AuditInterceptor, AuditLogQueryService],
  exports: [AuditLogService, AuditInterceptor, AuditLogQueryService],
})
export class AuditLogModule {}
