import { Tag } from 'antd';
import { TICKET_STATUS, UNKNOWN_STATUS, type TagConf } from './ticket-constants';

interface Props {
  status: number;
}

/**
 * 工单状态标签 — 把 status 数字映射成 antd Tag
 * 未知 status 走 UNKNOWN_STATUS 兜底
 */
export default function TicketStatusTag({ status }: Props) {
  const conf: TagConf = TICKET_STATUS[status] ?? UNKNOWN_STATUS;
  return <Tag color={conf.c}>{conf.t}</Tag>;
}
