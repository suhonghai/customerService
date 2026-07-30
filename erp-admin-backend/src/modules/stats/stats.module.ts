import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/**
 * StatsModule(Day 8)
 *
 * 依赖:
 * - PrismaModule(@Global)
 *
 * 接口:
 * - GET /api/stats/overview            总览
 * - GET /api/stats/agent-performance   客服绩效
 * - GET /api/stats/ai-hit-rate         AI 命中率
 */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
