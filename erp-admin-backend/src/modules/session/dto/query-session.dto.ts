import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * GET /api/sessions — 列表多维筛选
 *
 * 所有字段全可选,page/pageSize 默认 1/20
 * - visitorId / userId / status / startDate / endDate / hasRating
 * - sortBy / sortOrder 控制排序
 *
 * startDate / endDate 接受 ISO 字符串(Date 可解析)
 * hasRating 走 transform: 'true'/'false' → boolean(true=有评分, false=无评分)
 */
export class QuerySessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  visitorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2])
  status?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  hasRating?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: string = 'id';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
