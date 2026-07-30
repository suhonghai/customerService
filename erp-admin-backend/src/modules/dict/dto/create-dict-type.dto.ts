import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * POST /api/dicts/types — 创建字典类型
 *
 * code: 字母/数字/下划线/连字符,1-50
 * name: 1-100
 * remark: 可选
 */
export class CreateDictTypeDto {
  @IsString()
  @Length(1, 50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'code 仅允许字母、数字、下划线、连字符',
  })
  code!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  remark?: string;
}
