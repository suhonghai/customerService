import { IsISO8601, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /api/stats/agent-performance — 客服绩效
 *
 * 字段:
 * - startDate / endDate 可选(默认最近 30 天,ISO8601)
 * - agentId  可选(不传 = 全部 agent / agent_lead 角色用户)
 */
export class QueryAgentPerformanceDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  agentId?: number;
}
