'use client';
import { useState } from 'react';
import { getErpAdminClient } from '@/lib/erp-admin-client';

/**
 * cs-round-036:用户主动"结束对话"按钮
 *   挂在 ChatView 的 MessageInput 旁,只在工单 OPEN 状态(sessionHasOperator=true)显示。
 *   防误触:点击先弹 window.confirm(原生),确认后调 erp-admin-client.closeTicketBySession。
 *   成功后由 backend WS emit ticket_closed,父组件 RAGChat 收到后切终止 UI(本按钮自动隐藏)。
 *
 *   注意:ai-cs-demo 不依赖 antd(用自写 UI),所以用原生 confirm/alert 而非 antd Modal/message
 *   (宪法 II 简洁优先,不引入新依赖)
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

  const handleClick = async () => {
    // 原生 confirm 弹窗防误触 — 比 antd Modal 简单,无新依赖
    const ok = window.confirm(
      '确认结束本次咨询?\n\n结束后,客服将无法继续回复您本次的问题。如需继续,请发起新对话。',
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      await getErpAdminClient().closeTicketBySession(sessionKey);
      // 成功时不弹 toast — WS ticket_closed 事件会触发父组件切终止 UI 给用户反馈
    } catch (e) {
      window.alert(
        `结束对话失败:${e instanceof Error ? e.message : '未知错误'}`,
      );
    } finally {
      setSubmitting(false);
    }
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