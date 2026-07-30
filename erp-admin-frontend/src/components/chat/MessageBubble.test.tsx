import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MessageBubble, {
  AI_AVATAR,
  CUSTOMER_AVATAR,
  CUSTOMER_BG,
  OPERATOR_AVATAR,
  senderKind,
} from './MessageBubble';
import type { ChatMessage } from '@/hooks/use-conversation';

const base = {
  status: 1,
  metadata: {},
  createdAt: '2026-06-11T10:00:00Z',
} as const;

describe('MessageBubble', () => {
  it('renders customer bubble right-aligned with green background and 访客 label', () => {
    const msg: ChatMessage = {
      ...base,
      id: 1,
      role: 'user',
      content: '客户问题',
      metadata: { visitorId: 'visitor-xyz-1' },
    };
    render(<MessageBubble msg={msg} />);
    const bubble = screen.getByTestId('chat-bubble-customer');
    expect(bubble).toBeInTheDocument();
    // 访客标签带 visitorId 前 8 位
    expect(bubble).toHaveTextContent('访客 visitor-');
    expect(bubble).toHaveTextContent('客户问题');
  });

  it('renders operator bubble with operator/ticket pills', () => {
    const msg: ChatMessage = {
      ...base,
      id: 2,
      role: 'assistant',
      content: '运营回复',
      metadata: {
        source: 'operator',
        operatorName: '小张',
        ticketNo: 'T-001',
      },
    };
    render(<MessageBubble msg={msg} />);
    const bubble = screen.getByTestId('chat-bubble-operator');
    expect(bubble).toBeInTheDocument();
    expect(screen.getByTestId('chat-bubble-pill-ticket')).toHaveTextContent('工单 T-001');
    expect(screen.getByTestId('chat-bubble-pill-operator')).toHaveTextContent('客服 · 小张');
    expect(bubble).toHaveTextContent('运营回复');
  });

  it('renders AI bubble without pills', () => {
    const msg: ChatMessage = {
      ...base,
      id: 3,
      role: 'assistant',
      content: 'AI 自动回复',
      metadata: { source: 'ai' },
    };
    render(<MessageBubble msg={msg} />);
    const bubble = screen.getByTestId('chat-bubble-ai');
    expect(bubble).toBeInTheDocument();
    expect(bubble).toHaveTextContent('AI 客服');
    expect(bubble).toHaveTextContent('AI 自动回复');
    // AI 不应显示工单 / 客服 pill
    expect(screen.queryByTestId('chat-bubble-pill-ticket')).toBeNull();
    expect(screen.queryByTestId('chat-bubble-pill-operator')).toBeNull();
  });

  it('operator without ticketNo/operatorName shows no pill strip but still renders content', () => {
    const msg: ChatMessage = {
      ...base,
      id: 4,
      role: 'assistant',
      content: '裸运营',
      metadata: { source: 'operator' },
    };
    render(<MessageBubble msg={msg} />);
    expect(screen.getByTestId('chat-bubble-operator')).toBeInTheDocument();
    expect(screen.queryByTestId('chat-bubble-pill-ticket')).toBeNull();
    expect(screen.queryByTestId('chat-bubble-pill-operator')).toBeNull();
    expect(screen.getByTestId('chat-bubble-content')).toHaveTextContent('裸运营');
  });

  it('senderKind returns correct kind for each role/metadata combo', () => {
    expect(senderKind({ ...base, id: 1, role: 'user', content: '', metadata: {} })).toBe(
      'customer',
    );
    expect(
      senderKind({
        ...base,
        id: 2,
        role: 'assistant',
        content: '',
        metadata: { source: 'operator' },
      }),
    ).toBe('operator');
    expect(senderKind({ ...base, id: 3, role: 'assistant', content: '', metadata: {} })).toBe('ai');
    expect(
      senderKind({
        ...base,
        id: 4,
        role: 'system',
        content: '',
        metadata: {},
      }),
    ).toBe('ai');
  });

  it('exposes the design color constants (sanity: should match W11 spec)', () => {
    expect(CUSTOMER_BG).toBe('#95EC69');
    expect(CUSTOMER_AVATAR).toBe('#5B6FED');
    expect(OPERATOR_AVATAR).toBe('#07C060');
    expect(AI_AVATAR).toBe('#FF6B6B');
  });
});
