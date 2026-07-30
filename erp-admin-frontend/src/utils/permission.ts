/**
 * 权限判断工具
 *
 * 支持的格式:
 * - `*` 表示超级管理员全部通过
 * - `user:view` 精确匹配
 * - `user:*` 资源级通配(匹配 user:view / user:create 等)
 */
export function hasPermission(perms: string[], required: string): boolean {
  if (!required) return true;
  if (perms.includes('*')) return true;
  if (perms.includes(required)) return true;
  const [resource] = required.split(':');
  if (resource && perms.includes(`${resource}:*`)) return true;
  return false;
}

/**
 * 判断任意一个权限命中即可
 */
export function hasAnyPermission(perms: string[], required: string[]): boolean {
  return required.some((r) => hasPermission(perms, r));
}
