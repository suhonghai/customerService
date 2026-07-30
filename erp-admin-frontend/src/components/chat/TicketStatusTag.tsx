import { Tag } from 'antd';
import type { WsState } from '@/hooks/use-conversation';

/**
 * TicketStatusTag — WS 连接状态标签
 *
 * 拆分自 ConversationPanel.tsx 的 wsBadge useMemo。
 * - connected   → 绿色 "实时已连"
 * - connecting  → 蓝色 "连接中…"
 * - off         → 橙色 "实时未连(降级 REST)"
 * - na          → 灰色 "该工单无 session"
 */

export interface TicketStatusTagProps {
  state: WsState;
}

const TAGS: Record<WsState, { color: string; text: string }> = {
  connected: { color: 'green', text: '实时已连' },
  connecting: { color: 'blue', text: '连接中…' },
  off: { color: 'orange', text: '实时未连(降级 REST)' },
  na: { color: 'default', text: '该工单无 session' },
};

export default function TicketStatusTag({ state }: TicketStatusTagProps) {
  const cfg = TAGS[state];
  return (
    <Tag data-testid="chat-ws-status" data-state={state} color={cfg.color}>
      {cfg.text}
    </Tag>
  );
}
