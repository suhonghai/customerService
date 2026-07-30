import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BizException, BizCode } from '../exceptions/biz.exception';
import { ICurrentUser } from '../decorators/user.decorator';

export const ROLES_KEY = 'roles';

/**
 * RolesGuard(Day 3 真实实现)
 *
 * 配合 @Roles('super_admin', 'agent_lead') 装饰器使用
 *
 * 规则:
 * 1. 没标 @Roles → 放行
 * 2. 当前 user 角色里包含 'super_admin' → 通配通过
 * 3. 当前 user 角色与 required 任一相交 → 通过
 * 4. 否则抛 BizException(NO_PERMISSION)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const user = req.user as ICurrentUser | undefined;
    if (!user || !user.roles || user.roles.length === 0) {
      throw new BizException(BizCode.FORBIDDEN, '无角色信息,拒绝访问');
    }
    if (user.roles.includes('super_admin')) {
      return true;
    }
    const hit = required.some((r) => user.roles!.includes(r));
    if (!hit) {
      throw new BizException(
        BizCode.FORBIDDEN,
        `需要角色 [${required.join(', ')}]`,
      );
    }
    return true;
  }
}
