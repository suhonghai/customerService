'use client';
import { useState } from 'react';
import { getErpAdminClient } from '@/lib/erp-admin-client';
import { ConfirmDialog } from '../ConfirmDialog';

/**
 * cs-round-036:用户主动"结束对话"按钮
 *   挂在 ChatView 的 MessageInput 旁,只在工单 OPEN 状态(sessionHasOpenTicket=true)显示。
 *   防误触:点击先弹确认(原 window.confirm,cs-round-041 换皮为 ConfirmDialog),确认后调
 *   erp-admin-client.closeTicketBySession。成功后由 backend WS emit ticket_closed,
 *   父组件 RAGChat 收到后切终止 UI(本按钮自动隐藏)。
 *
 *   注意:ai-cs-demo 不依赖 antd(用自写 UI),所以不引入 antd Modal/message。
 *   (宪法 II 简洁优先,不引入新依赖)
 *
 * cs-round-041:确认弹窗从 window.confirm/alert 替换为 ConfirmDialog,匹配 W9-UI 暖橙风格。
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
  // cs-round-041:确认弹窗受控状态(open + 文案 + busy)
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 失败状态:用同一个 dialog 展示错误,避免 window.alert
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!visible || !sessionKey) return null;

  function handleClick() {
    setErrorMsg(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await getErpAdminClient().closeTicketBySession(sessionKey!);
      // 成功:关闭 dialog,WS ticket_closed 会触发父组件切终止 UI
      setConfirmOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      setErrorMsg(`结束对话失败:${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return; // busy 时不让用户关
    setConfirmOpen(false);
    setErrorMsg(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="px-3 py-1.5 text-sm rounded-md transition-colors font-medium"
        style={{
          background: '#FFFFFF',
          color: '#CF1322',
          border: '1px solid #FFA39E',
        }}
      >
        {submitting ? '处理中...' : '结束对话'}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={errorMsg ? '结束对话失败' : '结束本次咨询?'}
        description={
          errorMsg
            ? errorMsg
            : '结束后,客服将无法继续回复您本次的问题。如需继续,请发起新对话。'
        }
        confirmLabel={errorMsg ? '我知道了' : submitting ? '处理中...' : '结束'}
        cancelLabel="取消"
        variant="default"
        busy={submitting}
      />
    </>
  );
}