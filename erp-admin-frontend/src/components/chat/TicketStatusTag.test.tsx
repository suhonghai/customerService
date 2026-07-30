import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TicketStatusTag from './TicketStatusTag';

describe('TicketStatusTag', () => {
  it('renders green "实时已连" when state=connected', () => {
    render(<TicketStatusTag state="connected" />);
    const tag = screen.getByTestId('chat-ws-status');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveAttribute('data-state', 'connected');
    expect(tag).toHaveTextContent('实时已连');
  });

  it('renders blue "连接中…" when state=connecting', () => {
    render(<TicketStatusTag state="connecting" />);
    expect(screen.getByTestId('chat-ws-status')).toHaveTextContent('连接中');
  });

  it('renders orange "实时未连(降级 REST)" when state=off', () => {
    render(<TicketStatusTag state="off" />);
    expect(screen.getByTestId('chat-ws-status')).toHaveTextContent('降级 REST');
  });

  it('renders default "该工单无 session" when state=na', () => {
    render(<TicketStatusTag state="na" />);
    expect(screen.getByTestId('chat-ws-status')).toHaveTextContent('该工单无 session');
  });
});
