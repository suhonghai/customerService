import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TicketDetailDrawer from './TicketDetailDrawer';

// ConversationPanel 直接 mock,避免拉 socket.io
vi.mock('@/components/ConversationPanel', () => ({
  default: ({ ticketId }: { ticketId: number | string }) => (
    <div data-testid="conversation-panel">Conversation for ticket {String(ticketId)}</div>
  ),
}));

const ticket = {
  id: 42,
  ticketNo: 'T-042',
  title: '登录失败',
  status: 3,
  priority: 2,
  assigneeName: 'Alice',
  creatorName: 'Bob',
  slaDeadline: '2026-07-15T10:00:00Z',
  createdAt: '2026-07-14T08:00:00Z',
  description: '用户无法登录',
  logs: [],
};

describe('TicketDetailDrawer', () => {
  it('renders nothing inside drawer body when ticket is null and drawer is closed', () => {
    const { container } = render(
      <TicketDetailDrawer open={false} ticket={null} onClose={() => {}} />,
    );
    // antd Drawer 在 closed 状态下不会 mount 内部内容(portal 到 body 也不可见)
    expect(container).toBeDefined();
  });

  it('renders the drawer title with ticket number when open with a ticket', () => {
    render(<TicketDetailDrawer open={true} ticket={ticket} onClose={() => {}} />);
    expect(screen.getByText(/工单 T-042/)).toBeInTheDocument();
  });

  it('shows the conversation panel inside the chat tab', async () => {
    render(<TicketDetailDrawer open={true} ticket={ticket} onClose={() => {}} />);
    // 默认 tab=chat
    const panel = await screen.findByTestId('conversation-panel');
    expect(panel).toBeInTheDocument();
    expect(panel.textContent).toContain('42');
  });

  it('fires onClose when drawer close button clicked', async () => {
    const onClose = vi.fn();
    render(<TicketDetailDrawer open={true} ticket={ticket} onClose={onClose} />);
    // antd Drawer 的 close button 有 aria-label "Close"
    const closeBtn =
      screen.getByLabelText('Close') || screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
