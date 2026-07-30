import type { Dayjs } from 'dayjs';

/** 订单状态码 → 中文 label + Tag class */
export const ORDER_STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: '待发货', cls: 'tag-pending' },
  2: { label: '已发货', cls: 'tag-processing' },
  3: { label: '已收货', cls: 'tag-success' },
  4: { label: '已完成', cls: 'tag-success' },
  5: { label: '已取消', cls: 'tag-danger' },
};

/** 支付状态 */
export const PAY_STATUS: Record<number, { label: string; cls: string }> = {
  1: { label: '待支付', cls: 'tag-pending' },
  2: { label: '已支付', cls: 'tag-success' },
  3: { label: '已退款', cls: 'tag-danger' },
  4: { label: '部分退款', cls: 'tag-warning' },
};

/** 合法状态迁移:from → 可切换到的状态集合 */
export const VALID_TRANSITIONS: Record<number, number[]> = {
  1: [2, 5],
  2: [3, 5],
  3: [4],
  4: [],
  5: [],
};

/** 支付方式 code → 中文 */
export const PAY_METHOD_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行',
};

/** 物流公司选项 */
export const SHIP_COMPANIES = [
  { value: '顺丰', label: '顺丰' },
  { value: '圆通', label: '圆通' },
  { value: '中通', label: '中通' },
  { value: '韵达', label: '韵达' },
];

export type DateRange = [Dayjs | null, Dayjs | null] | null;

/** 表格筛选参数(传给 listOrders 的最小集) */
export interface OrderListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  orderStatus?: number;
  payStatus?: number;
  startDate?: string;
  endDate?: string;
}
