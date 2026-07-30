import { Button, Space } from 'antd';
import { PermissionButton } from '@/components/PermissionButton';

export interface TicketRow {
  id: number | string;
  ticketNo: string;
  status: number;
  assigneeId?: number | string;
  [key: string]: unknown;
}

export interface TicketActionsHandlers {
  onDetail: (row: TicketRow) => void;
  onAssign: (row: TicketRow) => void;
  onChangeStatus: (row: TicketRow) => void;
  onReply: (row: TicketRow) => void;
}

interface Props {
  row: TicketRow;
  isNarrow: boolean;
  handlers: TicketActionsHandlers;
}

/**
 * 操作按钮组:详情 / 分配 / 改状态 / 回复
 *
 * 行为契约:
 *   - 所有按钮 onClick 都委托给 handlers(由父组件管理 modal/drawer 状态)
 *   - 分配/改状态/回复 受 PermissionButton 权限码保护
 *   - 窄屏时宽度收敛(80 列) + wrap,保证不出列
 */
export default function TicketActions({ row, isNarrow, handlers }: Props) {
  return (
    <Space wrap size={isNarrow ? 'small' : 'middle'}>
      <Button size="small" onClick={() => handlers.onDetail(row)}>
        详情
      </Button>
      <PermissionButton permCode="ticket:assign">
        <Button size="small" onClick={() => handlers.onAssign(row)}>
          分配
        </Button>
      </PermissionButton>
      <PermissionButton permCode="ticket:update-status">
        <Button size="small" onClick={() => handlers.onChangeStatus(row)}>
          改状态
        </Button>
      </PermissionButton>
      <PermissionButton permCode="ticket:reply">
        <Button size="small" type="primary" onClick={() => handlers.onReply(row)}>
          回复
        </Button>
      </PermissionButton>
    </Space>
  );
}
