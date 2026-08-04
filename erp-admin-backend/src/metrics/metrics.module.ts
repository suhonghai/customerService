import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';

/**
 * MetricsModule(W11 Day 10)
 *
 * - Global module:MetricsService 可以在任何模块注入(未来在 audit / stats 等模块复用)
 * - 提供:
 *   - MetricsController:GET /api/metrics
 *   - MetricsService:prom-client Registry + 常用 metric
 *   - MetricsInterceptor:APP_INTERCEPTOR(在 main.ts 里挂)
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
