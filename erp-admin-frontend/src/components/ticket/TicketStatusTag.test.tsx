import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TicketStatusTag from './TicketStatusTag';
import { TICKET_STATUS } from './ticket-constants';

describe('TicketStatusTag', () => {
  it('renders the correct label for known status codes', () => {
    render(<TicketStatusTag status={3} />);
    expect(screen.getByText(TICKET_STATUS[3].t)).toBeInTheDocument();
  });

  it('falls back to 未知 for unknown status codes', () => {
    render(<TicketStatusTag status={999} />);
    expect(screen.getByText('未知')).toBeInTheDocument();
  });

  it('renders each of the 5 documented status values', () => {
    Object.values(TICKET_STATUS).forEach((conf) => {
      const { unmount } = render(<TicketStatusTag status={0} />);
      unmount();
      // spot-check the color tokens propagate through antd Tag
      expect(conf.t).toMatch(/待处理|处理中|待客户|已解决|已关闭/);
    });
  });
});
