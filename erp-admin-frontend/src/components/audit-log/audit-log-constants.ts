import type { Dayjs } from 'dayjs';

/**
 * AuditLog 业务常量 — 模块 / 动作 / 状态 选项 + Tag 颜色映射
 *
 * 与后端约定:
 *   status: 1 成功 / 0 失败
 */

/** 模块 Select 选项 */
export const MODULE_OPTIONS = [
  { value: 'auth', label: 'auth' },
  { value: 'user', label: 'user' },
  { value: 'role', label: 'role' },
  { value: 'menu', label: 'menu' },
  { value: 'dict', label: 'dict' },
  { value: 'ai-config', label: 'ai-config' },
  { value: 'session', label: 'session' },
  { value: 'ticket', label: 'ticket' },
  { value: 'order', label: 'order' },
  { value: 'faq', label: 'faq' },
];

/** 动作 Select 选项 */
export const ACTION_OPTIONS = [
  { value: 'create', label: 'create' },
  { value: 'update', label: 'update' },
  { value: 'delete', label: 'delete' },
  { value: 'login', label: 'login' },
  { value: 'logout', label: 'logout' },
  { value: 'reset-password', label: 'reset-password' },
  { value: 'change-password', label: 'change-password' },
  { value: 'assign-roles', label: 'assign-roles' },
  { value: 'assign-menus', label: 'assign-menus' },
];

/** 状态 Select 选项 */
export const STATUS_OPTIONS = [
  { value: 1, label: '成功' },
  { value: 0, label: '失败' },
];

/** status → Tag 颜色(用于列表 / 详情两处) */
export const STATUS_TAG_COLOR: Record<number, string> = {
  1: 'green',
  0: 'red',
};

/** status → 文案 */
export const STATUS_LABEL: Record<number, string> = {
  1: '成功',
  0: '失败',
};

export type DateRange = [Dayjs | null, Dayjs | null] | null;
