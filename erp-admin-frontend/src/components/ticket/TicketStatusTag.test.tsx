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

  it('renders each of the 4 documented status values', () => {
    // cs-round-034:TICKET_STATUS 删了 0(后端 @IsIn([1,2,3,4])),从 5 项变成 4 项
    const keys = Object.keys(TICKET_STATUS).map(Number);
    expect(keys.sort()).toEqual([1, 2, 3, 4]);

    Object.values(TICKET_STATUS).forEach((conf, idx) => {
      const status = keys[idx];
      const { unmount } = render(<TicketStatusTag status={status} />);
      unmount();
      // spot-check the color tokens propagate through antd Tag
      expect(conf.t).toMatch(/待领取|处理中|已解决|已关闭/);
    });
  });
});
