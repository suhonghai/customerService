import { Input, Select, DatePicker, Button, Space, Tooltip } from 'antd';
import { SearchOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { PermissionButton } from '@/components/PermissionButton';
import { ORDER_STATUS, PAY_STATUS, type DateRange } from './order-constants';

const { RangePicker } = DatePicker;

export interface OrderFiltersValue {
  keyword: string;
  orderStatus: number | undefined;
  payStatus: number | undefined;
  dateRange: DateRange;
}

export interface OrderFiltersProps {
  value: OrderFiltersValue;
  onChange: (next: OrderFiltersValue) => void;
  onRefresh: () => void;
  onExport: () => void;
}

/**
 * 订单筛选栏 — 关键字 / 订单状态 / 支付状态 / 时间范围 + 刷新 + 导出。
 *
 * 任何筛选条件变化都通过 onChange 上抛,具体清空/重置逻辑由父容器处理。
 */
export function OrderFilters({ value, onChange, onRefresh, onExport }: OrderFiltersProps) {
  const update = (patch: Partial<OrderFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <Space wrap style={{ marginBottom: 16 }}>
      <Input
        prefix={<SearchOutlined />}
        placeholder="订单号 / 客户 / 电话"
        allowClear
        style={{ width: 240 }}
        value={value.keyword}
        onChange={(e) => update({ keyword: e.target.value })}
      />
      <Select
        placeholder="订单状态"
        allowClear
        style={{ width: 120 }}
        value={value.orderStatus}
        onChange={(v) => update({ orderStatus: v })}
        options={Object.entries(ORDER_STATUS).map(([k, v]) => ({
          value: Number(k),
          label: v.label,
        }))}
      />
      <Select
        placeholder="支付状态"
        allowClear
        style={{ width: 120 }}
        value={value.payStatus}
        onChange={(v) => update({ payStatus: v })}
        options={Object.entries(PAY_STATUS).map(([k, v]) => ({
          value: Number(k),
          label: v.label,
        }))}
      />
      <RangePicker
        value={value.dateRange as any}
        onChange={(v) => update({ dateRange: v as DateRange })}
      />
      <Tooltip title="刷新">
        <Button icon={<ReloadOutlined />} onClick={onRefresh} />
      </Tooltip>
      <PermissionButton permCode="order:export">
        <Button icon={<DownloadOutlined />} onClick={onExport}>
          导出 CSV
        </Button>
      </PermissionButton>
    </Space>
  );
}

/**
 * 把 OrderFiltersValue 转成 listOrders 要的扁平参数对象。
 * 空值/未设值会被剔除,符合后端契约。
 */
export function toListParams(
  v: OrderFiltersValue,
  page: number,
  pageSize: number,
): Record<string, unknown> {
  const p: Record<string, unknown> = { page, pageSize };
  if (v.keyword) p.keyword = v.keyword;
  if (v.orderStatus !== undefined) p.orderStatus = v.orderStatus;
  if (v.payStatus !== undefined) p.payStatus = v.payStatus;
  if (v.dateRange?.[0]) p.startDate = v.dateRange[0].toISOString();
  if (v.dateRange?.[1]) p.endDate = v.dateRange[1].toISOString();
  return p;
}
