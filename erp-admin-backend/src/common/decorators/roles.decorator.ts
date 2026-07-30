import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * @Roles('super_admin', 'agent_lead') 装饰器
 * 配合 RolesGuard(Day 3 实现)使用
 *
 * 使用:
 *   @Roles('super_admin', 'agent_lead')
 *   @Get('xxx')
 *   async xxx() {}
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
