import { getInitials, timeLabel } from '@/utils/chat-format';
import type { ChatMessage } from '@/hooks/use-conversation';
import AvatarBlock from './AvatarBlock';

/**
 * MessageBubble — 单条对话气泡(客户右 / 运营/AI 左)
 *
 * 拆分自 ConversationPanel.tsx。
 * - 客户气泡:微信绿 #95EC69 + 右侧尾巴
 * - 运营/AI 气泡:白色 + 左侧尾巴;operator 元信息(工单号 / 客服名)显示在气泡内顶部
 */

export type SenderKind = 'customer' | 'operator' | 'ai';

// 微信绿气泡 + 三色头像
export const CUSTOMER_BG = '#95EC69';
export const CUSTOMER_AVATAR = '#5B6FED';
export const OPERATOR_AVATAR = '#07C060';
export const AI_AVATAR = '#FF6B6B';

export function senderKind(m: ChatMessage): SenderKind {
  if (m.role === 'user') return 'customer';
  if (m.metadata?.source === 'operator') return 'operator';
  return 'ai';
}

export interface MessageBubbleProps {
  msg: ChatMessage;
}

export default function MessageBubble({ msg }: MessageBubbleProps) {
  const kind = senderKind(msg);
  const time = timeLabel(msg.createdAt);

  if (kind === 'customer') {
    const vid: string = msg.metadata?.visitorId || '';
    const initials = getInitials(vid, '访');
    const nick = vid ? `访客 ${vid.slice(0, 8)}` : '访客';
    return (
      <div
        data-testid="chat-bubble-customer"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          gap: 8,
          padding: '4px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            maxWidth: '36rem',
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
              paddingRight: 2,
              fontSize: 12,
              color: '#737373',
              lineHeight: 1.4,
            }}
          >
            <span>{time}</span>
            <span style={{ color: '#5B6FED' }}>{nick}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <div
              data-testid="chat-bubble-content"
              style={{
                background: CUSTOMER_BG,
                color: '#1A1A1A',
                borderRadius: 8,
                padding: '9px 12px',
                fontSize: 14,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                maxWidth: '32rem',
              }}
            >
              {msg.content}
            </div>
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 12,
                right: -5,
                width: 0,
                height: 0,
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderLeft: `6px solid ${CUSTOMER_BG}`,
              }}
            />
          </div>
        </div>
        <AvatarBlock text={initials} bg={CUSTOMER_AVATAR} />
      </div>
    );
  }

  // operator / ai — 左对齐
  const isOperator = kind === 'operator';
  const operatorName: string = msg.metadata?.operatorName || '';
  const avatarText = isOperator ? operatorName.slice(0, 1) || '客' : 'AI';
  const avatarBg = isOperator ? OPERATOR_AVATAR : AI_AVATAR;
  const nick = isOperator ? operatorName || '客服' : 'AI 客服';

  return (
    <div
      data-testid={isOperator ? 'chat-bubble-operator' : 'chat-bubble-ai'}
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: 8,
        padding: '4px 0',
      }}
    >
      <AvatarBlock text={avatarText} bg={avatarBg} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          maxWidth: '36rem',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
            paddingLeft: 2,
            fontSize: 12,
            color: '#737373',
            lineHeight: 1.4,
          }}
        >
          <span style={{ color: isOperator ? '#047857' : '#737373', fontWeight: 500 }}>{nick}</span>
          <span>{time}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 12,
              left: -5,
              width: 0,
              height: 0,
              borderTop: '5px solid transparent',
              borderBottom: '5px solid transparent',
              borderRight: '6px solid #ffffff',
              zIndex: 1,
            }}
          />
          <div
            data-testid="chat-bubble-content"
            style={{
              background: '#ffffff',
              color: '#1A1A1A',
              border: '1px solid #E5E5E5',
              borderRadius: 8,
              padding: '9px 12px',
              fontSize: 14,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              maxWidth: '32rem',
            }}
          >
            {isOperator && (msg.metadata?.ticketNo || msg.metadata?.operatorName) && (
              <div
                data-testid="chat-bubble-meta-strip"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexWrap: 'wrap',
                  marginBottom: 6,
                }}
              >
                {msg.metadata?.ticketNo && (
                  <span
                    data-testid="chat-bubble-pill-ticket"
                    style={{
                      background: '#ecfdf5',
                      color: '#047857',
                      fontSize: 12,
                      padding: '1px 8px',
                      borderRadius: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    工单 {msg.metadata.ticketNo}
                  </span>
                )}
                {msg.metadata?.operatorName && (
                  <span
                    data-testid="chat-bubble-pill-operator"
                    style={{
                      background: '#ecfdf5',
                      color: '#047857',
                      fontSize: 12,
                      padding: '1px 8px',
                      borderRadius: 4,
                      lineHeight: 1.6,
                    }}
                  >
                    客服 · {msg.metadata.operatorName}
                  </span>
                )}
              </div>
            )}
            {msg.content}
          </div>
        </div>
      </div>
    </div>
  );
}
