import { Select, DatePicker, Button, Space } from 'antd';
import { STATUS_OPTIONS, RATING_OPTIONS, type SessionFiltersValue } from './session-constants';

const { RangePicker } = DatePicker;

export interface SessionFiltersProps {
  value: SessionFiltersValue;
  onChange: (next: SessionFiltersValue) => void;
  onReset: () => void;
}

/**
 * Session 筛选栏 — 状态下拉 + 日期范围 + 是否有评分 + 重置。
 *
 * 纯受控:value/onChange 由父容器接管,reset 也通过父容器触发(避免本组件持有 reset 临时态)。
 */
export function SessionFilters({ value, onChange, onReset }: SessionFiltersProps) {
  const update = (patch: Partial<SessionFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <Space style={{ marginBottom: 16 }} wrap>
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
        onChange={(v) => update({ dateRange: v as SessionFiltersValue['dateRange'] })}
        placeholder={['开始日期', '结束日期']}
      />
      <Select
        placeholder="评分"
        style={{ width: 120 }}
        allowClear
        value={value.hasRating}
        onChange={(v) => update({ hasRating: v })}
        options={RATING_OPTIONS}
      />
      <Button onClick={onReset}>重置</Button>
    </Space>
  );
}

/**
 * 把 SessionFiltersValue 转成 sessionApi.list 要的扁平参数对象。
 * 空值/未设值会被剔除,符合后端契约。
 */
export function toListParams(
  v: SessionFiltersValue,
  page: number,
  pageSize: number,
): Record<string, unknown> {
  const p: Record<string, unknown> = { page, pageSize };
  if (v.status !== undefined) p.status = v.status;
  if (v.dateRange?.[0]) p.startDate = v.dateRange[0].toISOString();
  if (v.dateRange?.[1]) p.endDate = v.dateRange[1].toISOString();
  if (v.hasRating !== undefined) p.hasRating = v.hasRating;
  return p;
}
