import { useMemo } from 'react';
import { Table, Grid } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import TicketStatusTag from './TicketStatusTag';
import TicketPriorityTag from './TicketPriorityTag';
import TicketActions, { type TicketActionsHandlers, type TicketRow } from './TicketActions';

export interface TicketListItem extends TicketRow {
  id: number | string;
  ticketNo: string;
  title: string;
  status: number;
  priority: number;
  assigneeName?: string;
  creatorName?: string;
  slaDeadline?: string | null;
  createdAt?: string | null;
}

interface Props {
  rows: TicketListItem[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  handlers: TicketActionsHandlers;
}

/**
 * 工单表格 — 列定义 + 窄屏响应式 + 横向滚动
 *
 * 行为契约(由 d201af1 锁定):
 *   - Grid.useBreakpoint() 拿 screens
 *   - isNarrow = !screens.md(< 768 px 走 narrow 路径)
 *   - 窄屏隐藏列:assigneeName / creatorName / slaDeadline / createdAt
 *   - 操作列 fixed: 'right',宽度 isNarrow ? 80 : 280
 *   - Table size = isNarrow ? 'small' : 'middle'
 *   - Table scroll.x = 'max-content'(横向溢出时内部滚动)
 *   - 窄屏 pagination.showSizeChanger = false
 */
export default function TicketTable({
  rows,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  handlers,
}: Props) {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;

  // 列定义;只依赖 isNarrow(其余列无外部依赖)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allColumns: ColumnsType<TicketListItem> = useMemo(
    () => [
      { key: 'ticketNo', title: '工单号', dataIndex: 'ticketNo', width: 170 },
      { key: 'title', title: '标题', dataIndex: 'title', ellipsis: true },
      {
        key: 'status',
        title: '状态',
        dataIndex: 'status',
        width: 100,
        render: (s: number) => <TicketStatusTag status={s} />,
      },
      {
        key: 'priority',
        title: '优先级',
        dataIndex: 'priority',
        width: 90,
        render: (p: number) => <TicketPriorityTag priority={p} />,
      },
      {
        key: 'assigneeName',
        title: '处理人',
        dataIndex: 'assigneeName',
        width: 110,
      },
      {
        key: 'creatorName',
        title: '创建人',
        dataIndex: 'creatorName',
        width: 110,
      },
      {
        key: 'slaDeadline',
        title: 'SLA 截止',
        dataIndex: 'slaDeadline',
        width: 170,
        render: (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '-'),
      },
      {
        key: 'createdAt',
        title: '创建时间',
        dataIndex: 'createdAt',
        width: 170,
        render: (v: string | null | undefined) => (v ? new Date(v).toLocaleString() : '-'),
      },
      {
        key: 'actions',
        title: '操作',
        fixed: 'right',
        width: isNarrow ? 80 : 280,
        render: (_: unknown, r: TicketListItem) => (
          <TicketActions row={r} isNarrow={isNarrow} handlers={handlers} />
        ),
      },
    ],
    [isNarrow, handlers],
  );

  // narrow (<768) 时只保留最关键 4 列 + 操作
  const columns = useMemo(() => {
    if (!isNarrow) return allColumns;
    const narrowHidden = new Set(['assigneeName', 'creatorName', 'slaDeadline', 'createdAt']);
    return allColumns.filter((c) => !narrowHidden.has(String(c.key)));
  }, [allColumns, isNarrow]);

  return (
    <Table<TicketListItem>
      rowKey="id"
      loading={loading}
      dataSource={rows}
      columns={columns}
      scroll={{ x: 'max-content' }}
      size={isNarrow ? 'small' : 'middle'}
      pagination={{
        current: page,
        pageSize,
        total,
        onChange: onPageChange,
        size: isNarrow ? 'small' : 'default',
        showSizeChanger: !isNarrow,
      }}
    />
  );
}
