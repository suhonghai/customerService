import { useState } from 'react';
import { Input, Button, Spin, Empty, Alert, message as antdMessage } from 'antd';
import { useConversation } from '@/hooks/use-conversation';
import MessageGroup from './chat/MessageGroup';
import TicketStatusTag from './chat/TicketStatusTag';

/**
 * ConversationPanel — 共享 thread 的"运营端"实时对话面板
 *
 * 拆分后只做装配:
 *  - useConversation(ticketId, sessionId) → 拉历史 / 连 WS / 发送 / 分组
 *  - MessageGroup + MessageBubble 渲染
 *  - 输入框 + 发送按钮
 *
 * 子模块:
 *  - hooks/use-conversation.ts    socket.io-client lifecycle + send + groups
 *  - utils/chat-format.ts         时间 / 缩写格式化
 *  - components/chat/AvatarBlock  头像
 *  - components/chat/MessageBubble 气泡
 *  - components/chat/MessageGroup 时间分组
 *  - components/chat/TicketStatusTag WS 状态 tag
 */

export interface ConversationPanelProps {
  ticketId: number;
  sessionId: number | null;
  ticketNo?: string;
}

export default function ConversationPanel({
  ticketId,
  sessionId,
  ticketNo,
}: ConversationPanelProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const { messages, loading, wsState, send, listRef, groups, error } = useConversation(
    ticketId,
    sessionId,
  );

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await send(text);
      setDraft('');
    } catch (e: any) {
      antdMessage.error(`发送失败: ${e?.message || '未知错误'}`);
    } finally {
      setSending(false);
    }
  };

  if (!sessionId) {
    return (
      <div>
        <Alert
          type="warning"
          showIcon
          message="该工单未关联会话,对话流不可用"
          description="请联系创建方(ai-cs-demo 侧)补录会话上下文,或确认工单创建时 sessionKey 字段是否正确传值(应为 cs- 开头的字符串,不是数字 sessionId)。"
          style={{ marginBottom: 12 }}
        />
        <Empty description="该工单未关联会话,无对话流" style={{ padding: '40px 0' }} />
      </div>
    );
  }
  if (loading) {
    // antd Spin `tip` prop only works in `nest` or `fullscreen` mode; default mode
    // emits a console warning and silently drops the text. Render the hint as a
    // sibling div instead so the user actually sees it.
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#8C8C8C' }}>
        <Spin />
        <div style={{ marginTop: 12 }}>加载对话...</div>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <Alert
          type="error"
          showIcon
          message={`对话历史加载失败:${error.message}`}
          style={{ marginBottom: 12 }}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 560,
          border: '1px solid #E5E5E5',
          borderRadius: 6,
          background: '#ffffff',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid #EFEFEF',
            background: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 13, color: '#595959' }}>
            会话 #{sessionId}
            {ticketNo && <span style={{ marginLeft: 8, color: '#8C8C8C' }}>· 工单 {ticketNo}</span>}
          </div>
          <div>
            <TicketStatusTag state={wsState} />
          </div>
        </div>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 14px',
          background: '#F5F5F5',
        }}
      >
        {messages.length === 0 ? (
          <Empty description="暂无消息" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {groups.map((g, gi) => (
              <MessageGroup key={gi} group={g} />
            ))}
          </div>
        )}
      </div>
      <div
        style={{
          borderTop: '1px solid #EFEFEF',
          padding: 12,
          background: '#ffffff',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <Input.TextArea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="回复客户 — Enter 发送,Shift+Enter 换行"
          disabled={sending}
        />
        <Button type="primary" loading={sending} onClick={onSend}>
          发送
        </Button>
      </div>
      </div>
    </div>
  );
}
