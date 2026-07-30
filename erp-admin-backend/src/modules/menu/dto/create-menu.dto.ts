import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMenuDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  parentId?: number | null;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  component?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  /**
   * 1 目录 / 2 菜单 / 3 按钮
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  type!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  permCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number = 0;

  @IsOptional()
  @IsBoolean()
  visible?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number = 1;
}
