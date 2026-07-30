import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /api/cs/auth/login 请求体
 */
export class CsLoginDto {
  @ApiProperty({ example: 'customer@example.com', description: 'C 端邮箱' })
  @IsString()
  @IsNotEmpty({ message: '邮箱不能为空' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  @MaxLength(100)
  email!: string;

  @ApiProperty({ example: 'Customer@123', description: '密码(≥ 6 位)' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100)
  password!: string;
}
