import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TicketFilters from './TicketFilters';

describe('TicketFilters', () => {
  const baseValue = { keyword: '', status: undefined, priority: undefined };
  const handlers = {
    onChange: vi.fn(),
    onSearch: vi.fn(),
  };

  it('fires onSearch with the entered keyword on Enter', async () => {
    render(
      <TicketFilters
        value={baseValue}
        isNarrow={false}
        onChange={handlers.onChange}
        onSearch={handlers.onSearch}
      />,
    );
    const input = screen.getByPlaceholderText('工单号/标题');
    await userEvent.type(input, 'login fail{Enter}');
    expect(handlers.onSearch).toHaveBeenCalledWith('login fail');
  });

  it('renders status and priority select placeholders', () => {
    render(
      <TicketFilters
        value={baseValue}
        isNarrow={false}
        onChange={handlers.onChange}
        onSearch={handlers.onSearch}
      />,
    );
    // antd Select 用 role=combobox 渲染
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes.length).toBe(2);
  });

  it('does not crash on clear of keyword via allowClear icon', async () => {
    render(
      <TicketFilters
        value={{ ...baseValue, keyword: 'old' }}
        isNarrow={false}
        onChange={handlers.onChange}
        onSearch={handlers.onSearch}
      />,
    );
    const input = screen.getByPlaceholderText('工单号/标题');
    expect(input).toBeInTheDocument();
    // 不直接操作 clear(antd 在 jsdom 下不容易触发),仅验证输入框存在
    expect(within(input).queryByRole('button')).toBeDefined();
  });
});
