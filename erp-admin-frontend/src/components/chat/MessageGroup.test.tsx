import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessageGroup from './MessageGroup';
import type { MessageGroup as MessageGroupType } from '@/hooks/use-conversation';

describe('MessageGroup', () => {
  it('renders time pill at top and bubbles below', () => {
    const group: MessageGroupType = {
      time: '2026-06-11T10:00:00Z',
      msgs: [
        {
          id: 1,
          role: 'user',
          content: 'm1',
          status: 1,
          metadata: { visitorId: 'vid-1' },
          createdAt: '2026-06-11T10:00:00Z',
        },
        {
          id: 2,
          role: 'assistant',
          content: 'm2',
          status: 1,
          metadata: { source: 'operator' },
          createdAt: '2026-06-11T10:01:00Z',
        },
      ],
    };
    const now = new Date('2026-06-11T12:00:00');
    render(<MessageGroup group={group} now={now} />);
    const root = screen.getByTestId('chat-message-group');
    expect(root).toBeInTheDocument();
    // 时间 pill 渲染
    const pill = screen.getByTestId('chat-message-group-time');
    expect(pill).toBeInTheDocument();
    // 内部渲染 2 个气泡(customer + operator)
    expect(screen.getByTestId('chat-bubble-customer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-operator')).toBeInTheDocument();
  });

  it('uses now injection for cross-day time pill', () => {
    const group: MessageGroupType = {
      time: '2026-06-10T10:00:00Z',
      msgs: [
        {
          id: 1,
          role: 'user',
          content: 'old',
          status: 1,
          metadata: { visitorId: 'v' },
          createdAt: '2026-06-10T10:00:00Z',
        },
      ],
    };
    const now = new Date('2026-06-11T12:00:00');
    render(<MessageGroup group={group} now={now} />);
    const pill = screen.getByTestId('chat-message-group-time');
    // 跨天:locale string 包含 06/10
    expect(pill).toHaveTextContent(/06\/10/);
  });
});
