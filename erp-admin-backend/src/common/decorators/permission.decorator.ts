import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * @RequirePermission('user:create', 'user:update') 装饰器
 * 配合 PermissionGuard(Day 3 实现)使用
 *
 * 使用:
 *   @RequirePermission('user:create')
 *   @Post()
 *   async create() {}
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
