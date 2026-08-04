import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POST /api/dicts/:code/items — 新增字典项
 *
 * label / value 必填
 * sort / isDefault / cssClass / remark 可选
 */
export class CreateDictItemDto {
  @IsString()
  @Length(1, 100)
  label!: string;

  @IsString()
  @Length(1, 100)
  value!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number = 0;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean = false;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  cssClass?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}
