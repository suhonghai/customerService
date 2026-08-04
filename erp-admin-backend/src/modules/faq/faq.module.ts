import { Module } from '@nestjs/common';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { FaqChromaService } from './faq-chroma.service';

/**
 * FaqModule(Day 5)
 *
 * 依赖:
 * - PrismaModule(@Global)
 * - AuditLogModule(@Global,AuditLogService)
 * - CommonServicesModule(@Global,Splitter / Embedding / FileStorage)
 *
 * 注:不要在这里 re-provide 'FILE_STORAGE',由 FileStorageModule @Global 提供
 */
@Module({
  controllers: [FaqController],
  providers: [FaqService, FaqChromaService],
  exports: [FaqService, FaqChromaService],
})
export class FaqModule {}
