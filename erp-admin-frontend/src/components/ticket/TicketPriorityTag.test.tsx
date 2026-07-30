import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TicketPriorityTag from './TicketPriorityTag';
import { TICKET_PRIORITY } from './ticket-constants';

describe('TicketPriorityTag', () => {
  it('renders the correct label for known priority codes', () => {
    render(<TicketPriorityTag priority={3} />);
    expect(screen.getByText('紧急')).toBeInTheDocument();
  });

  it('falls back to ? for unknown priority codes', () => {
    render(<TicketPriorityTag priority={42} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('covers all 4 priority buckets', () => {
    expect(TICKET_PRIORITY[0].t).toBe('低');
    expect(TICKET_PRIORITY[1].t).toBe('中');
    expect(TICKET_PRIORITY[2].t).toBe('高');
    expect(TICKET_PRIORITY[3].t).toBe('紧急');
  });
});
