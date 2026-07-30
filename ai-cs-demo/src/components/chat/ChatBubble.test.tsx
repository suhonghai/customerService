import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from './ChatBubble';

describe('ChatBubble', () => {
  it('renders a user message on the right (justify-end)', () => {
    const { container } = render(<ChatBubble role="user" text="hello" timeLabel="10:00" />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    const wrap = container.querySelector('.justify-end');
    expect(wrap).toBeTruthy();
  });

  it('renders an assistant message with operator badge', () => {
    render(
      <ChatBubble
        role="assistant"
        text="已为您处理"
        operatorBadge={{ ticketNo: 'T-1', operatorName: '客服小李' }}
        timeLabel="10:01"
      />,
    );
    expect(screen.getByText('已为您处理')).toBeInTheDocument();
    expect(screen.getByText(/工单 T-1/)).toBeInTheDocument();
    expect(screen.getByText(/客服 · 客服小李/)).toBeInTheDocument();
  });

  it('shows aborted hint when aborted=true', () => {
    render(<ChatBubble role="assistant" text="partial answer" aborted timeLabel="10:02" />);
    expect(screen.getByText(/已被用户取消/)).toBeInTheDocument();
  });

  it('renders usage tokens and cost when provided', () => {
    render(
      <ChatBubble
        role="assistant"
        text="hi"
        usage={{ totalTokens: 1234, cost: 0.0023 }}
        timeLabel="10:03"
      />,
    );
    expect(screen.getByText(/1234 token/)).toBeInTheDocument();
    expect(screen.getByText(/¥0\.0023/)).toBeInTheDocument();
  });

  it('shows the interruptAction slot when provided', () => {
    render(
      <ChatBubble
        role="assistant"
        text=""
        timeLabel="10:04"
        interruptAction={<button>继续生成</button>}
      />,
    );
    expect(screen.getByText('继续生成')).toBeInTheDocument();
  });
});
