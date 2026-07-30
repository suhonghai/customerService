/**
 * 路由 → 面包屑中文映射
 *
 * 之前 BasicLayout 直接用 pathname 路径片段做 fallback,
 * 导致 `/system/user` 显示成 `system / user`,语义不清。
 *
 * 这里用静态映射覆盖所有业务路径,未匹配再退回 fallback。
 */

export const routeMap: Record<string, string> = {
  '/': '首页',

  // Dashboard / Stats
  '/stats': '数据看板 / 总览',

  // 系统管理
  '/system/user': '系统管理 / 用户管理',
  '/system/role': '系统管理 / 角色管理',
  '/system/menu': '系统管理 / 菜单管理',

  // 会话 / 工单 / 审计
  '/session/list': '会话管理 / 会话列表',
  '/audit-log/list': '审计日志 / 日志列表',

  // 业务管理
  '/dict': '数据字典 / 字典管理',

  // AI 配置
  '/ai-config': 'AI 配置 / 模型配置',
  '/ai-config/prompt': 'AI 配置 / Prompt 模板',

  // FAQ
  '/faq': 'FAQ 管理 / 文档列表',

  // 业务
  '/orders': '订单管理 / 订单列表',
  '/tickets': '工单管理 / 工单列表',

  // 个人
  '/profile': '个人中心 / 我的资料',

  // 异常页(给 404/403 标题用)
  '/403': '无权限',
  '/404': '页面不存在',
  '/login': '登录',
};

/**
 * 把 pathname 转换成面包屑 items 数组
 *
 * @example
 *   getBreadcrumb('/system/user')
 *   // → [{ title: '系统管理' }, { title: '用户管理' }]
 */
export function getBreadcrumb(pathname: string): { title: string }[] {
  const trail = routeMap[pathname];
  if (trail) {
    return trail.split(' / ').map((title) => ({ title }));
  }
  // fallback:用路径片段(避免显示空)
  return pathname
    .split('/')
    .filter(Boolean)
    .map((title) => ({ title }));
}
