import type { Dayjs } from 'dayjs';

/**
 * Session 业务常量 — 状态 / 评分 → 颜色 + 文案 映射
 *
 * 与 backend 约定:
 *   status:  1 进行中 / 2 已结束
 *   rating:  >= 4 满意 / >= 3 一般 / < 3 不满意 / null 未评
 */

/** 会话状态 code → Select 选项 */
export const STATUS_OPTIONS = [
  { value: 1, label: '进行中' },
  { value: 2, label: '已结束' },
];

/** 会话状态 code → 表格 Tag 颜色 + 中文 */
export const STATUS_TAG: Record<number, { color: string; label: string }> = {
  1: { color: 'processing', label: '进行中' },
  2: { color: 'default', label: '已结束' },
};

/** 评分筛选选项(用于 Filters 顶部下拉) */
export const RATING_OPTIONS = [
  { value: true, label: '有评分' },
  { value: false, label: '无评分' },
];

/** DateRange 类型(给 SessionFilters 用,Dayjs 元组或 null) */
export type SessionDateRange = [Dayjs | null, Dayjs | null] | null;

/** Filters 持有的最小集,父容器通过 onChange 接管 */
export interface SessionFiltersValue {
  status: number | undefined;
  dateRange: SessionDateRange;
  hasRating: boolean | undefined;
}
