import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AuditLogFilters,
  toListParams,
  EMPTY_FILTERS,
  type AuditLogFiltersValue,
} from './AuditLogFilters';
import { MODULE_OPTIONS, ACTION_OPTIONS, STATUS_OPTIONS } from './audit-log-constants';

describe('<AuditLogFilters />', () => {
  it('renders 3 selects + range picker + reset button', () => {
    const onChange = vi.fn();
    const onReset = vi.fn();

    render(<AuditLogFilters value={EMPTY_FILTERS} onChange={onChange} onReset={onReset} />);

    // 3 个 Select 各有一个 combobox role
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBe(3);
    // 重置按钮 — antd Button 用 <span>重</span><span>置</span> 分字渲染,
    // 用 normalize 函数匹配,避开 antd Button 把字拆到独立 span/插入空白的问题。
    // div / button / span 都会"包含"该 text,改用 getAllByText 取第一个(button)。
    const matches = screen.getAllByText((_, el) => el?.textContent?.replace(/\s+/g, '') === '重置');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('reset button triggers onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(<AuditLogFilters value={EMPTY_FILTERS} onChange={() => {}} onReset={onReset} />);

    // 从匹配列表里挑 button(role=button + class .ant-btn)
    const matches = screen.getAllByText((_, el) => el?.textContent?.replace(/\s+/g, '') === '重置');
    const resetBtn = matches.find(
      (el) => el.tagName === 'BUTTON' || el.closest('button'),
    ) as HTMLElement;
    await user.click(resetBtn.closest('button') ?? resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('selecting module fires onChange with module field patched', async () => {
    const onChange = vi.fn();
    render(<AuditLogFilters value={EMPTY_FILTERS} onChange={onChange} onReset={() => {}} />);

    // antd Select 通过 combobox 渲染,点开后用键盘选择第一个选项(模块值 = 'auth')
    const moduleCombobox = screen.getAllByRole('combobox')[0];
    fireEvent.mouseDown(moduleCombobox);

    // MODULE_OPTIONS 第一项的 value
    const expected = MODULE_OPTIONS[0].value;
    const labelText = MODULE_OPTIONS[0].label;
    const option = await screen.findByText(labelText, {
      selector: '.ant-select-item-option-content',
    });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AuditLogFiltersValue;
    expect(lastCall.module).toBe(expected);
  });

  it('selecting status (numeric value) fires onChange with number', async () => {
    const onChange = vi.fn();
    render(<AuditLogFilters value={EMPTY_FILTERS} onChange={onChange} onReset={() => {}} />);

    const comboboxes = screen.getAllByRole('combobox');
    // 状态 Select 是第三个 combobox
    const statusCombobox = comboboxes[2];
    fireEvent.mouseDown(statusCombobox);

    // STATUS_OPTIONS 第二项 = 失败(0)
    const failedOpt = await screen.findByText('失败', {
      selector: '.ant-select-item-option-content',
    });
    fireEvent.click(failedOpt);

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AuditLogFiltersValue;
    expect(lastCall.status).toBe(0);
  });

  it('action select first option value is "create"', async () => {
    const onChange = vi.fn();
    render(<AuditLogFilters value={EMPTY_FILTERS} onChange={onChange} onReset={() => {}} />);

    const actionCombobox = screen.getAllByRole('combobox')[1];
    fireEvent.mouseDown(actionCombobox);

    const expected = ACTION_OPTIONS[0].value;
    const labelText = ACTION_OPTIONS[0].label;
    const option = await screen.findByText(labelText, {
      selector: '.ant-select-item-option-content',
    });
    fireEvent.click(option);

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AuditLogFiltersValue;
    expect(lastCall.action).toBe(expected);
  });

  it('STATUS_OPTIONS contains the expected success/failure pair', () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: 1, label: '成功' },
      { value: 0, label: '失败' },
    ]);
  });
});

describe('toListParams', () => {
  it('builds flat params, dropping empty values', () => {
    const v: AuditLogFiltersValue = {
      module: 'user',
      action: undefined,
      status: 1,
      dateRange: null,
    };
    expect(toListParams(v, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      module: 'user',
      status: 1,
    });
  });

  it('serializes dayjs dateRange to ISO strings', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-31T23:59:59.000Z');
    const v: AuditLogFiltersValue = {
      module: undefined,
      action: undefined,
      status: undefined,
      // 模拟 dayjs 对象 — 真实用法是 dayjs() 包装;此处直接传入 Date-like,
      // 因为 toListParams 内部只调用 .toISOString()
      dateRange: [start as never, end as never],
    };
    expect(toListParams(v, 2, 50)).toEqual({
      page: 2,
      pageSize: 50,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
  });

  it('returns base page+pageSize when no filters set', () => {
    expect(toListParams(EMPTY_FILTERS, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
    });
  });
});
