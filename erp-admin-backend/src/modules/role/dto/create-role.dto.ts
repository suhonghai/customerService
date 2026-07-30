import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z_-]+$/, {
    message: 'code 只能包含小写字母、下划线、短横线',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  dataScope?: number = 1;

  /**
   * 自定义部门 ID 列表(逗号分隔数字字符串)
   * 当 dataScope=4 时必填
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customDeptIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  status?: number = 1;
}
