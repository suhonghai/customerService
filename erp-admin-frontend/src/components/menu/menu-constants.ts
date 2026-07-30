/**
 * 菜单类型 / 状态 / 颜色等静态映射。
 *
 * Menu 是树形 CRUD(type 1=目录 / 2=菜单 / 3=按钮),
 * 父级选择 + 可见/状态 tag 颜色都靠这里集中。
 */

/** 菜单类型 Select 选项 */
export const TYPE_OPTIONS = [
  { value: 1, label: '目录' },
  { value: 2, label: '菜单' },
  { value: 3, label: '按钮' },
];

/** 菜单类型码 → 中文 label */
export const TYPE_LABEL: Record<number, string> = {
  1: '目录',
  2: '菜单',
  3: '按钮',
};

/** 菜单类型 → 表格列里 name 旁 tag 颜色 */
export const TYPE_COLOR: Record<number, string> = {
  1: 'blue',
  2: 'cyan',
  3: 'purple',
};

/** 状态 Select 选项(启用/禁用) */
export const STATUS_OPTIONS = [
  { value: 1, label: '启用' },
  { value: 0, label: '禁用' },
];

/** 状态码 → tag 颜色 */
export const STATUS_COLOR: Record<number, string> = {
  1: 'green',
  0: 'red',
};

/** 可见布尔 → tag 文本 */
export const VISIBLE_LABEL: Record<'true' | 'false', { text: string; color: string }> = {
  true: { text: '是', color: 'green' },
  false: { text: '否', color: 'default' },
};

/** 新增/编辑默认值 */
export const DEFAULT_MENU_VALUES = {
  type: 2 as const,
  status: 1,
  visible: true,
  sort: 0,
  parentId: null,
};
