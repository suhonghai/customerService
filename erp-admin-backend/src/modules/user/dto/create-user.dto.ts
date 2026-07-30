import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  MinLength,
  MaxLength,
  IsEmail,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'username 只能包含字母数字下划线短横线',
  })
  username!: string;

  /**
   * 初始密码(明文,service 端 bcrypt 哈希)
   * 长度 8-50,包含字母+数字
   */
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  roleIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
