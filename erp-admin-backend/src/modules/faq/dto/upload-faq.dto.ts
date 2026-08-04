import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';

/**
 * POST /api/faq/upload  +  POST /api/faq/:id/upload-version
 *
 * multer 解析 file 字段 → @UploadedFile() 取 buffer
 * 其他字段通过 multipart 的 text 字段提交 → @Body() 拿
 */
export class UploadFaqDto {
  @IsString()
  @IsNotEmpty({ message: 'title 必填' })
  @MaxLength(200)
  title!: string;

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

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changelog?: string;
}
