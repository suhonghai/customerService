import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import dayjs from 'dayjs';
import { SessionFilters, toListParams } from './SessionFilters';
import type { SessionFiltersValue } from './session-constants';

const NO_FILTERS: SessionFiltersValue = {
  status: undefined,
  dateRange: null,
  hasRating: undefined,
};

describe('<SessionFilters />', () => {
  // 给到 15s 兜底:串行 25 文件并发跑时 antd Select 渲染偶发超时
  it('renders status + rating placeholders + reset button', { timeout: 15000 }, () => {
    const onChange = vi.fn();
    const onReset = vi.fn();

    render(<SessionFilters value={NO_FILTERS} onChange={onChange} onReset={onReset} />);

    // 状态 / 评分 是 antd Select,placeholder 可见
    expect(screen.getAllByText('状态').length).toBeGreaterThan(0);
    expect(screen.getAllByText('评分').length).toBeGreaterThan(0);
    // 重置按钮(antd 默认会在中文字符之间插空格)
    expect(screen.getByText(/重.*置/)).toBeTruthy();
  });

  it('clicking reset triggers onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<SessionFilters value={NO_FILTERS} onChange={() => {}} onReset={onReset} />);

    await user.click(screen.getByText(/重.*置/));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe('toListParams', () => {
  it('builds flat params, dropping empty values', () => {
    const v: SessionFiltersValue = {
      status: 1,
      dateRange: null,
      hasRating: undefined,
    };
    expect(toListParams(v, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      status: 1,
    });
  });

  it('serializes dayjs dateRange to ISO strings', () => {
    const start = dayjs('2026-01-01T00:00:00.000Z');
    const end = dayjs('2026-01-31T23:59:59.000Z');
    const v: SessionFiltersValue = {
      status: undefined,
      dateRange: [start, end],
      hasRating: true,
    };
    expect(toListParams(v, 2, 50)).toEqual({
      page: 2,
      pageSize: 50,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      hasRating: true,
    });
  });

  it('drops falsy dateRange entries (only one bound)', () => {
    const start = dayjs('2026-01-01T00:00:00.000Z');
    const v: SessionFiltersValue = {
      status: undefined,
      dateRange: [start, null],
      hasRating: undefined,
    };
    expect(toListParams(v, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      startDate: start.toISOString(),
    });
  });

  it('keeps hasRating=false (explicit false is meaningful)', () => {
    const v: SessionFiltersValue = {
      status: undefined,
      dateRange: null,
      hasRating: false,
    };
    expect(toListParams(v, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      hasRating: false,
    });
  });
});
