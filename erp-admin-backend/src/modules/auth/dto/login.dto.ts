import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /api/auth/login 请求体
 */
export class LoginDto {
  @ApiProperty({ example: 'admin', description: '用户名' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MaxLength(50)
  username!: string;

  @ApiProperty({ example: 'Admin@123', description: '密码' })
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(100)
  password!: string;
}
