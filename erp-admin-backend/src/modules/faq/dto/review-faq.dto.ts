import { IsInt, IsIn, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POST /api/faq/:id/review
 *
 * status:
 *   2 = 发布(触发 Chroma 入库)
 *   3 = 下线(触发 Chroma 删除)
 */
export class ReviewFaqDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  versionId!: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([2, 3], { message: 'status 必须为 2(发布)/ 3(下线)' })
  status!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
