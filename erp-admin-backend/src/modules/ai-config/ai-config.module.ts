import { Global, Module } from '@nestjs/common';
import { AiConfigController } from './ai-config.controller';
import { AiConfigService } from './ai-config.service';

/**
 * AiConfigModule(Day 4 + Day 11 @Global)
 *
 * 改为 @Global 是为了:
 * - EmbeddingService(在 CommonServicesModule)能直接 inject AiConfigService
 * - 实现"后台改 ai-config → EmbeddingService 热重载"链路
 */
@Global()
@Module({
  controllers: [AiConfigController],
  providers: [AiConfigService],
  exports: [AiConfigService],
})
export class AiConfigModule {}
