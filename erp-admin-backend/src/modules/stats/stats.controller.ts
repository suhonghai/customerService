import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { StatsService } from './stats.service';
import { QueryAgentPerformanceDto } from './dto/query-agent-performance.dto';
import { QueryAiHitRateDto } from './dto/query-ai-hit-rate.dto';

@ApiTags('看板统计')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * GET /api/stats/overview — 总览
   *   必须在 :id 路由之前(虽然这里没有 :id,但保持习惯)
   */
  @Get('overview')
  @RequirePermission('stats:view', 'stats:*')
  @ApiOperation({ summary: '总览(今日会话/工单/AI 命中率/平均评分 + 7 天趋势)' })
  async overview() {
    return this.statsService.overview();
  }

  /**
   * GET /api/stats/agent-performance — 客服绩效
   */
  @Get('agent-performance')
  @RequirePermission('stats:view', 'stats:*')
  @ApiOperation({ summary: '客服绩效(每人接单数/响应时长/评分)' })
  async agentPerformance(@Query() query: QueryAgentPerformanceDto) {
    return this.statsService.agentPerformance(query);
  }

  /**
   * GET /api/stats/ai-hit-rate — AI 命中率
   */
  @Get('ai-hit-rate')
  @RequirePermission('stats:view', 'stats:*')
  @ApiOperation({ summary: 'AI 命中率(按模型)' })
  async aiHitRate(@Query() query: QueryAiHitRateDto) {
    return this.statsService.aiHitRate(query);
  }
}
