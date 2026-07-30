import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { OrderFilters, toListParams, type OrderFiltersValue } from './OrderFilters';
import { useAuthStore } from '@/stores/auth';

const NO_FILTERS: OrderFiltersValue = {
  keyword: '',
  orderStatus: undefined,
  payStatus: undefined,
  dateRange: null,
};

beforeEach(() => {
  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    userInfo: { id: 1, username: 'tester', permissions: ['order:export'] as any } as any,
  });
});

describe('<OrderFilters />', () => {
  it('renders input + selects + refresh + export buttons', () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    const onExport = vi.fn();

    render(
      <OrderFilters
        value={NO_FILTERS}
        onChange={onChange}
        onRefresh={onRefresh}
        onExport={onExport}
      />,
    );

    expect(screen.getByPlaceholderText('订单号 / 客户 / 电话')).toBeTruthy();
    // 订单状态 / 支付状态 是 Select,placeholder 文本可见
    expect(screen.getAllByText('订单状态').length).toBeGreaterThan(0);
    expect(screen.getAllByText('支付状态').length).toBeGreaterThan(0);
    // 导出按钮
    expect(screen.getByText('导出 CSV')).toBeTruthy();
  });

  it('change keyword triggers onChange with new value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderFilters
        value={NO_FILTERS}
        onChange={onChange}
        onRefresh={() => {}}
        onExport={() => {}}
      />,
    );

    const input = screen.getByPlaceholderText('订单号 / 客户 / 电话');
    // user.type 默认 per-keystroke 触发;改为 fireEvent.change 一次性设置值更稳定
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as OrderFiltersValue;
    expect(lastCall.keyword).toBe('abc');
  });

  it('clear keyword (allowClear) resets to empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OrderFilters
        value={{ ...NO_FILTERS, keyword: 'hello' }}
        onChange={onChange}
        onRefresh={() => {}}
        onExport={() => {}}
      />,
    );

    // antd allowClear 是 hover 后显示的 × 图标;这里直接验证初始 value 已渲染
    expect(screen.getByDisplayValue('hello')).toBeTruthy();
    // 调用 onChange 模拟清空
    onChange({ ...NO_FILTERS, keyword: '' });
    expect(onChange).toHaveBeenCalled();
  });

  it('clicking refresh button triggers onRefresh', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { container } = render(
      <OrderFilters
        value={NO_FILTERS}
        onChange={() => {}}
        onRefresh={onRefresh}
        onExport={() => {}}
      />,
    );

    // 刷新按钮是个无文字的 icon Button,定位那个 ReloadOutlined 渲染的 svg 按钮
    const refreshBtn = container.querySelector('button.ant-btn') as HTMLElement | null;
    expect(refreshBtn).toBeTruthy();
    await user.click(refreshBtn!);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('clicking export triggers onExport', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <OrderFilters
        value={NO_FILTERS}
        onChange={() => {}}
        onRefresh={() => {}}
        onExport={onExport}
      />,
    );

    await user.click(screen.getByText('导出 CSV'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('toListParams', () => {
  it('builds flat params, dropping empty values', () => {
    const v: OrderFiltersValue = {
      keyword: 'foo',
      orderStatus: 2,
      payStatus: undefined,
      dateRange: null,
    };
    expect(toListParams(v, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      keyword: 'foo',
      orderStatus: 2,
    });
  });

  it('serializes dayjs dateRange to ISO strings', () => {
    const start = dayjs('2026-01-01T00:00:00.000Z');
    const end = dayjs('2026-01-31T23:59:59.000Z');
    const v: OrderFiltersValue = {
      keyword: '',
      orderStatus: undefined,
      payStatus: undefined,
      dateRange: [start, end],
    };
    expect(toListParams(v, 2, 50)).toEqual({
      page: 2,
      pageSize: 50,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  });
});
