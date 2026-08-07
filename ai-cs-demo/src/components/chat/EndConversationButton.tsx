'use client';
import { useState } from 'react';
import { Modal, message } from 'antd';
import { getErpAdminClient } from '@/lib/erp-admin-client';

/**
 * cs-round-036:用户主动"结束对话"按钮
 *   挂在 ChatView 的 MessageInput 旁,只在工单 OPEN 状态(sessionHasOperator=true)显示。
 *   防误触:点击先弹 Modal.confirm,确认后调 erp-admin-client.closeTicketBySession。
 *   成功后由 backend WS emit ticket_closed,父组件 RAGChat 收到后切终止 UI(本按钮自动隐藏)。
 */
export interface EndConversationButtonProps {
  sessionKey: string | null;
  visible: boolean; // 工单 OPEN 才显示
}

export function EndConversationButton({
  sessionKey,
  visible,
}: EndConversationButtonProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!visible || !sessionKey) return null;

  const handleClick = () => {
    Modal.confirm({
      title: '确认结束本次咨询?',
      content:
        '结束后,客服将无法继续回复您本次的问题。如需继续,请发起新对话。',
      okText: '结束对话',
      cancelText: '再等等',
      okButtonProps: { danger: true },
      onOk: async () => {
        setSubmitting(true);
        try {
          await getErpAdminClient().closeTicketBySession(sessionKey);
          message.success('对话已结束');
          // WS ticket_closed 事件会触发父组件切终止 UI,这里不用主动切
        } catch (e) {
          message.error(
            `结束对话失败:${e instanceof Error ? e.message : '未知错误'}`,
          );
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="px-3 py-2 text-sm rounded-lg transition-colors"
      style={{
        background: 'transparent',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {submitting ? '处理中...' : '结束对话'}
    </button>
  );
}