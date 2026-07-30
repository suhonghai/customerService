import { formatGroupTime } from '@/utils/chat-format';
import type { MessageGroup as MessageGroupType } from '@/hooks/use-conversation';
import MessageBubble from './MessageBubble';

/**
 * MessageGroup — 一组时间相邻(5 分钟内)的消息
 *
 * 拆分自 ConversationPanel.tsx 的内联渲染。
 * - 顶部居中时间 pill
 * - 下面逐条 MessageBubble
 */

export interface MessageGroupProps {
  group: MessageGroupType;
  /** 测试 / SSR 注入"今天"时间基准;默认 new Date() */
  now?: Date;
}

export default function MessageGroup({ group, now }: MessageGroupProps) {
  return (
    <div
      data-testid="chat-message-group"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
        <span
          data-testid="chat-message-group-time"
          style={{
            background: 'rgba(0,0,0,0.08)',
            color: '#666666',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 4,
            lineHeight: 1.55,
            letterSpacing: 0.2,
          }}
        >
          {formatGroupTime(group.time, now)}
        </span>
      </div>
      {group.msgs.map((m) => (
        <MessageBubble key={m.id} msg={m} />
      ))}
    </div>
  );
}
