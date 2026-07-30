import { IsISO8601, IsOptional } from 'class-validator';

/**
 * GET /api/stats/ai-hit-rate — AI 命中率(按模型)
 *
 * 字段:
 * - startDate / endDate 可选(默认最近 30 天,ISO8601)
 */
export class QueryAiHitRateDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
