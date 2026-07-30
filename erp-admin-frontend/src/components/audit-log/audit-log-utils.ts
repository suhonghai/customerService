import { STATUS_LABEL, STATUS_TAG_COLOR } from './audit-log-constants';

/**
 * AuditLog 工具函数 — 时间格式化 / 状态映射
 */

/** 格式化日期字符串;空值返回 '-' */
export function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleString() : '-';
}

/** status code → antd Tag color */
export function statusColor(s: number): string {
  return STATUS_TAG_COLOR[s] ?? 'default';
}

/** status code → 中文 label */
export function statusLabel(s: number): string {
  return STATUS_LABEL[s] ?? '未知';
}

/**
 * 把空值序列化:用于审计详情抽屉的 params / oldValue / newValue 三处 JSON 展示。
 * null/undefined → '无',对象/数组 → 缩进 JSON。
 */
export function fmtJson(v: unknown): string {
  if (v == null) return '无';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
