import { Tag } from 'antd';
import { TICKET_PRIORITY, UNKNOWN_PRIORITY, type TagConf } from './ticket-constants';

interface Props {
  priority: number;
}

/**
 * 工单优先级标签 — 把 priority 数字映射成 antd Tag
 * 未知 priority 走 UNKNOWN_PRIORITY 兜底
 */
export default function TicketPriorityTag({ priority }: Props) {
  const conf: TagConf = TICKET_PRIORITY[priority] ?? UNKNOWN_PRIORITY;
  return <Tag color={conf.c}>{conf.t}</Tag>;
}
