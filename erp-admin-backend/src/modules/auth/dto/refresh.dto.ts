import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * POST /api/auth/refresh 请求体
 */
export class RefreshDto {
  @ApiProperty({ description: '刷新 token' })
  @IsString()
  @IsNotEmpty({ message: 'refreshToken 不能为空' })
  refreshToken!: string;
}
