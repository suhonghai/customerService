/**
 * Dashboard 快速入口配置 — 静态数据 + icon 映射。
 *
 * icon key 字符串而非 JSX,以便 .ts 文件能被 oxc parser 编译(纯 .ts 不接受 JSX)。
 * 实际图标渲染在 QuickAccessGrid 里通过 ICON_MAP 解出来。
 */

export type QuickLinkIconKey =
  'user' | 'role' | 'menu' | 'ai' | 'session' | 'stats' | 'audit' | 'dict' | 'profile';

export interface QuickLink {
  path: string;
  title: string;
  desc: string;
  icon: QuickLinkIconKey;
  /** 权限 code(无 perm = 始终可见,例如 Profile 走登录态) */
  perm?: string;
}

/**
 * Dashboard 快速入口 9 宫格配置。
 *
 * 每条链接对应一个业务模块;带 `perm` 的会受 `enabled()` 校验,无 perm 一律放行。
 * perm 形如 `user:view` —— `enabled()` 会同时接受精确匹配和模块通配 `user:*`。
 */
export const LINKS: QuickLink[] = [
  {
    path: '/system/user',
    title: 'Users',
    desc: '账户 · 角色 · 密码',
    icon: 'user',
    perm: 'user:view',
  },
  {
    path: '/system/role',
    title: 'Roles',
    desc: 'RBAC 角色 · 权限矩阵',
    icon: 'role',
    perm: 'role:view',
  },
  {
    path: '/system/menu',
    title: 'Menus',
    desc: '菜单树 · 按钮权限',
    icon: 'menu',
    perm: 'menu:view',
  },
  {
    path: '/ai-config',
    title: 'AI Models',
    desc: '模型 · Prompt · API keys',
    icon: 'ai',
    perm: 'ai-config:view',
  },
  {
    path: '/sessions',
    title: 'Sessions',
    desc: '实时会话 · AI 命中',
    icon: 'session',
    perm: 'session:view',
  },
  {
    path: '/stats',
    title: 'Stats',
    desc: '总览 · 工单 · 命中率',
    icon: 'stats',
    perm: 'stats:view',
  },
  {
    path: '/audit-logs',
    title: 'Audit',
    desc: '操作流水 · 变更对比',
    icon: 'audit',
    perm: 'audit-log:view',
  },
  { path: '/dict', title: 'Dict', desc: '状态枚举 · 字典维护', icon: 'dict', perm: 'dict:view' },
  { path: '/profile', title: 'Profile', desc: '个人信息 · 修改密码', icon: 'profile' },
];
