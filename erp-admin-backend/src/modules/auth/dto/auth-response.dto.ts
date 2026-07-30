import { ApiProperty } from '@nestjs/swagger';

/**
 * 登录 / 刷新 通用响应 data
 * 见 docs/erp-admin/03-api-spec.md 第 2 节
 */
export class AuthUserDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'admin' })
  username!: string;

  @ApiProperty({ example: '超级管理员', nullable: true })
  nickname!: string | null;

  @ApiProperty({ example: null, nullable: true })
  avatar!: string | null;

  @ApiProperty({ type: [String], example: ['super_admin'] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['user:create', 'user:update'] })
  permissions!: string[];
}

export class AuthResponseDto {
  @ApiProperty({ description: 'access token(2h)' })
  accessToken!: string;

  @ApiProperty({ description: 'refresh token(7d)' })
  refreshToken!: string;

  @ApiProperty({ example: 7200, description: 'access token 剩余秒数' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

/**
 * /me 响应 data(包含完整菜单树 + permCode 列表)
 */
export class MeRoleDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class MeMenuDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ nullable: true })
  parentId!: number | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  path!: string | null;

  @ApiProperty({ nullable: true })
  component!: string | null;

  @ApiProperty({ nullable: true })
  icon!: string | null;

  @ApiProperty({ description: '1 目录 / 2 菜单 / 3 按钮' })
  type!: number;

  @ApiProperty({ nullable: true })
  permCode!: string | null;

  @ApiProperty()
  sort!: number;

  @ApiProperty()
  visible!: boolean;

  @ApiProperty({ type: [MeMenuDto] })
  children!: MeMenuDto[];
}

export class MeResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  username!: string;

  @ApiProperty({ nullable: true })
  nickname!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @ApiProperty({ type: [MeRoleDto] })
  roles!: MeRoleDto[];

  @ApiProperty({ type: [MeMenuDto] })
  menus!: MeMenuDto[];

  @ApiProperty({ type: [String] })
  permissions!: string[];
}
