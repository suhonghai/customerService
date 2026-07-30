import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BizException, BizCode } from '../exceptions/biz.exception';
import { ICurrentUser } from '../decorators/user.decorator';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

/**
 * PermissionGuard(Day 3 真实实现)
 *
 * 配合 @RequirePermission('user:create') 装饰器使用
 *
 * 通配规则:
 * 1. user.permissions 包含 '*' → 通过
 * 2. user.permissions 包含 'super_admin' / 等同 super_admin 角色的虚拟通配 → 通过
 * 3. 精确匹配 → 通过
 * 4. 资源通配 'user:*' 匹配 'user:create' 等 → 通过
 * 5. 都没有 → 抛 BizException(NO_PERMISSION)
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }
    const req = context.switchToHttp().getRequest();
    const user = req.user as ICurrentUser | undefined;
    const perms = user?.permissions ?? [];

    // 1) '*' 通配
    if (perms.includes('*')) return true;

    // 2) super_admin 角色 → 等同通配
    if (user?.roles?.includes('super_admin')) return true;

    // 3) 精确匹配 + {resource}:* 通配
    const hit = required.some((p) => {
      if (perms.includes(p)) return true;
      const [resource] = p.split(':');
      return resource ? perms.includes(`${resource}:*`) : false;
    });

    if (!hit) {
      throw new BizException(
        BizCode.FORBIDDEN,
        `需要权限 [${required.join(', ')}]`,
      );
    }
    return true;
  }
}
