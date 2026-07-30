/**
 * Role 页面静态映射 —— 数据权限 / 状态 / 新增默认值。
 *
 * 这些常量既给 RoleTable 的 tag 渲染用,又给 RoleFormModal 的 Select 选项用,
 * 集中在这里便于单点修改(参考 menu-constants 同款结构)。
 */

/** 数据权限 Select 选项(1-5 共 5 档) */
export const DATA_SCOPE_OPTIONS = [
  { value: 1, label: '全部' },
  { value: 2, label: '本部门' },
  { value: 3, label: '本部门及下级' },
  { value: 4, label: '本人' },
  { value: 5, label: '自定义' },
];

/** 数据权限码 → 中文 label(给表格 tag 用) */
export const DATA_SCOPE_LABEL: Record<number, string> = {
  1: '全部',
  2: '本部门',
  3: '本部门及下级',
  4: '本人',
  5: '自定义',
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

/** 新增角色时的默认值(给 form.setFieldsValue 用) */
export const DEFAULT_ROLE_VALUES = {
  status: 1,
  dataScope: 1,
  sort: 0,
};

/** 编辑时 code 字段的格式校验正则 */
export const CODE_PATTERN = /^[a-zA-Z0-9_:-]+$/;
