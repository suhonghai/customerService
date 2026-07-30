import { Select, DatePicker, Button, Space } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  MODULE_OPTIONS,
  ACTION_OPTIONS,
  STATUS_OPTIONS,
  type DateRange,
} from './audit-log-constants';

const { RangePicker } = DatePicker;

export interface AuditLogFiltersValue {
  module: string | undefined;
  action: string | undefined;
  status: number | undefined;
  dateRange: DateRange;
}

export interface AuditLogFiltersProps {
  value: AuditLogFiltersValue;
  onChange: (next: AuditLogFiltersValue) => void;
  onReset: () => void;
}

/** 空筛选(用于受控 value 初始化 / 重置) */
export const EMPTY_FILTERS: AuditLogFiltersValue = {
  module: undefined,
  action: undefined,
  status: undefined,
  dateRange: null,
};

/**
 * AuditLog 筛选栏 — 模块 / 动作 / 状态 / 时间范围 + 重置。
 *
 * 任何筛选条件变化都通过 onChange 上抛,具体清空/重置逻辑由父容器处理。
 * 完全受控:依赖外部传入 value 渲染,本身不持有任何业务状态。
 */
export function AuditLogFilters({ value, onChange, onReset }: AuditLogFiltersProps) {
  const update = (patch: Partial<AuditLogFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <Space style={{ marginBottom: 16 }} wrap>
      <Select
        placeholder="模块"
        style={{ width: 140 }}
        allowClear
        value={value.module}
        onChange={(v) => update({ module: v })}
        options={MODULE_OPTIONS}
      />
      <Select
        placeholder="动作"
        style={{ width: 140 }}
        allowClear
        value={value.action}
        onChange={(v) => update({ action: v })}
        options={ACTION_OPTIONS}
      />
      <Select
        placeholder="状态"
        style={{ width: 120 }}
        allowClear
        value={value.status}
        onChange={(v) => update({ status: v })}
        options={STATUS_OPTIONS}
      />
      <RangePicker
        value={value.dateRange as never}
        onChange={(v) => update({ dateRange: v as [Dayjs, Dayjs] | null })}
      />
      <Button onClick={onReset}>重置</Button>
    </Space>
  );
}

/**
 * 把 AuditLogFiltersValue 转成 auditLogApi.list 要的扁平参数对象。
 * 空值/未设值会被剔除,符合后端契约。
 */
export function toListParams(
  v: AuditLogFiltersValue,
  page: number,
  pageSize: number,
): Record<string, unknown> {
  const p: Record<string, unknown> = { page, pageSize };
  if (v.module) p.module = v.module;
  if (v.action) p.action = v.action;
  if (v.status !== undefined) p.status = v.status;
  if (v.dateRange?.[0]) p.startDate = v.dateRange[0].toISOString();
  if (v.dateRange?.[1]) p.endDate = v.dateRange[1].toISOString();
  return p;
}
