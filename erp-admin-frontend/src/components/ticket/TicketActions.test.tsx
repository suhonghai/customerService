import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TicketActions from './TicketActions';
import { useAuthStore } from '@/stores/auth';

function setPerms(perms: string[]) {
  useAuthStore.setState({
    userInfo: { id: 1, username: 'tester', roles: [], permissions: perms },
  });
}

const baseRow = { id: 1, ticketNo: 'T-001', status: 0 };

const handlers = {
  onDetail: vi.fn(),
  onAssign: vi.fn(),
  onChangeStatus: vi.fn(),
  onReply: vi.fn(),
};

/**
 * antd Button 在 2 字符间插空格("回 复"),在 3+ 字符不插。
 * 通过遍历 button.textContent(去掉所有空白)精确匹配 label。
 */
function clickByLabel(label: string) {
  const buttons = screen.getAllByRole('button');
  const target = buttons.find((b) => (b.textContent || '').replace(/\s+/g, '') === label);
  if (!target) throw new Error(`no button with label ${label}`);
  fireEvent.click(target);
}

function countByLabel(label: string): number {
  return screen
    .getAllByRole('button')
    .filter((b) => (b.textContent || '').replace(/\s+/g, '') === label).length;
}

describe('TicketActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ userInfo: null });
  });

  it('detail button always fires (no permission gate)', () => {
    setPerms([]);
    render(<TicketActions row={baseRow} isNarrow={false} handlers={handlers} />);
    clickByLabel('详情');
    expect(handlers.onDetail).toHaveBeenCalledWith(baseRow);
  });

  it('assign button is hidden without ticket:assign permission', () => {
    setPerms([]);
    render(<TicketActions row={baseRow} isNarrow={false} handlers={handlers} />);
    expect(countByLabel('分配')).toBe(0);
  });

  it('assign button is visible and clickable with ticket:assign', () => {
    setPerms(['ticket:assign']);
    render(<TicketActions row={baseRow} isNarrow={false} handlers={handlers} />);
    clickByLabel('分配');
    expect(handlers.onAssign).toHaveBeenCalledWith(baseRow);
  });

  it('reply button requires ticket:reply permission', () => {
    setPerms(['ticket:reply']);
    render(<TicketActions row={baseRow} isNarrow={false} handlers={handlers} />);
    clickByLabel('回复');
    expect(handlers.onReply).toHaveBeenCalledWith(baseRow);
  });

  it('change-status button requires ticket:update-status permission', () => {
    setPerms(['ticket:update-status']);
    render(<TicketActions row={baseRow} isNarrow={false} handlers={handlers} />);
    clickByLabel('改状态');
    expect(handlers.onChangeStatus).toHaveBeenCalledWith(baseRow);
  });
});
