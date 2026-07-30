import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser() 装饰器:从 request.user 拿当前登录用户
 * Day 1: JwtAuthGuard 桩模式返回 mock user,Day 2+ 接真实 JWT 后自动注入
 *
 * 使用:
 *   @Get('me')
 *   async me(@CurrentUser() user: ICurrentUser) { ... }
 *
 *   // 拿特定字段
 *   async me(@CurrentUser('id') userId: number) { ... }
 */
export interface ICurrentUser {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
  avatar?: string;
  roles?: string[];
  permissions?: string[];
  departmentId?: number;
}

export const CurrentUser = createParamDecorator(
  (data: keyof ICurrentUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user: ICurrentUser | undefined = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
