import { Input, Select } from 'antd';
import { TICKET_STATUS, TICKET_PRIORITY } from './ticket-constants';

export interface TicketFiltersValue {
  keyword: string;
  status?: number;
  priority?: number;
}

interface Props {
  value: TicketFiltersValue;
  isNarrow: boolean;
  onChange: (next: TicketFiltersValue) => void;
  /** 任意筛选条件变化都触发;onSearch 触发 onChange({...value, keyword}) */
  onSearch: (keyword: string) => void;
}

/**
 * 筛选栏:搜索框 + 状态下拉 + 优先级下拉
 *
 * 设计:
 *   - 关键字搜索:按 Enter / 点击搜索图标触发 onSearch(立即触发,不等防抖)
 *   - 下拉改变:立即触发 onChange(包含 status/priority),由父组件决定何时 reset page
 *   - 窄屏:每项宽度 100%,自动换行
 */
export default function TicketFilters({ value, isNarrow, onChange, onSearch }: Props) {
  const fullWidth = isNarrow ? '100%' : undefined;
  const selectWidth = isNarrow ? '100%' : 140;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
      }}
    >
      <Input.Search
        placeholder="工单号/标题"
        allowClear
        style={{ width: fullWidth ?? 240, minWidth: 180 }}
        defaultValue={value.keyword}
        onSearch={(v) => onSearch(v)}
      />
      <Select
        placeholder="状态"
        allowClear
        style={{ width: selectWidth, minWidth: 140 }}
        value={value.status}
        onChange={(v) => onChange({ ...value, status: v })}
        options={Object.entries(TICKET_STATUS).map(([k, v]) => ({
          value: Number(k),
          label: v.t,
        }))}
      />
      <Select
        placeholder="优先级"
        allowClear
        style={{ width: selectWidth, minWidth: 140 }}
        value={value.priority}
        onChange={(v) => onChange({ ...value, priority: v })}
        options={Object.entries(TICKET_PRIORITY).map(([k, v]) => ({
          value: Number(k),
          label: v.t,
        }))}
      />
    </div>
  );
}
