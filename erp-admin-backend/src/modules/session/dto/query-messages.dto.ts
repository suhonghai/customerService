import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * GET /api/sessions/:id/messages — 消息分页
 *
 * 字段:
 * - page / pageSize  分页(默认 1 / 50)
 * - sortOrder        'asc' 时间正序 / 'desc' 时间倒序(默认 desc)
 */
export class QueryMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 50;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
