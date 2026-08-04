import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PUT /api/faq/:id
 *
 * 只允许改元数据(title / category / tags / description)
 * 改文件内容请走 POST /api/faq/:id/upload-version
 */
export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tags?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
