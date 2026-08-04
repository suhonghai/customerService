import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * PUT /api/dicts/items/:id — 更新字典项
 *
 * 全部字段可选(部分更新)
 */
export class UpdateDictItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  label?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  value?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  cssClass?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}
