import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * PUT /api/auth/password 请求体
 *
 * 密码强度(参考 04-rbac-model.md 安全规范):
 * - 至少 8 位
 * - 至少 1 个大写字母
 * - 至少 1 个小写字母
 * - 至少 1 个数字
 */
export class ChangePasswordDto {
  @ApiProperty({ description: '旧密码' })
  @IsString()
  @IsNotEmpty({ message: '旧密码不能为空' })
  oldPassword!: string;

  @ApiProperty({ description: '新密码(8 位+ 大小写+数字)' })
  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message: '新密码必须包含大小写字母和数字',
  })
  newPassword!: string;
}
