import type { QuickLink } from './dashboard-constants';

/**
 * 时段 → 问候语。
 *
 * 0-5 深夜 / 6-11 上午 / 12-17 下午 / 18-23 晚上。
 * 边界采用 `<` 严格比较,与原 page 行为一致(h=6 是 morning,h=12 是 afternoon,h=18 是 evening)。
 */
export function greetByHour(h: number): string {
  if (h < 6) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * 权限判定:无 perm → 放行;`*` 超级管理员通配;精确匹配;模块通配 `user:*`。
 */
export function enabled(perms: string[], link: QuickLink): boolean {
  if (!link.perm) return true;
  if (perms.includes('*')) return true;
  if (perms.includes(link.perm)) return true;
  const mod = link.perm.split(':')[0];
  return perms.includes(`${mod}:*`);
}

/**
 * 日期格式化:形如 "Jul 16, 2026" 英文月日年。
 * 抽出来便于测试时 mock Date。
 */
export function formatDateEn(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
