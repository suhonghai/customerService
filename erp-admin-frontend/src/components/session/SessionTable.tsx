import { Table, Tag, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { SessionListItem } from '@/services/session';
import { STATUS_TAG } from './session-constants';
import { RatingTag, fmtDate } from './session-utils.tsx';

export interface SessionTableProps {
  data: SessionListItem[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onDetail: (s: SessionListItem) => void;
  onDelete: (id: number) => void;
}

/**
 * 会话表格 — 列定义 + 行内操作按钮组。
 *
 * 纯展示 + 事件回调,不持有任何业务状态。所有权限校验通过 PermissionButton 完成。
 */
export function SessionTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
  onDelete,
}: SessionTableProps) {
  const columns: ColumnsType<SessionListItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '访客ID', dataIndex: 'visitorId', width: 140 },
    {
      title: '访客名',
      dataIndex: 'visitorName',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    { title: '渠道', dataIndex: 'channelLabel', width: 80 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: number) => {
        const meta = STATUS_TAG[s] || { color: 'default', label: '未知' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    { title: '消息数', dataIndex: 'messageCount', width: 80 },
    {
      title: '评分',
      dataIndex: 'rating',
      width: 130,
      render: (v: number | null) => <RatingTag value={v} />,
    },
    {
      title: '开始',
      dataIndex: 'startedAt',
      width: 170,
      render: (d: string) => fmtDate(d),
    },
    {
      title: '结束',
      dataIndex: 'endedAt',
      width: 170,
      render: (d: string | null) => fmtDate(d),
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      render: (_, r: SessionListItem) => (
        <Space>
          <Button size="small" onClick={() => onDetail(r)}>
            详情
          </Button>
          <PermissionButton permCode="session:delete">
            <Popconfirm title="确认删除?" onConfirm={() => onDelete(r.id)}>
              <Button size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </PermissionButton>
        </Space>
      ),
    },
  ];

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    onChange: onPageChange,
  };

  return (
    <Table<SessionListItem>
      rowKey="id"
      loading={loading}
      dataSource={data}
      scroll={{ x: 1100 }}
      pagination={pagination}
      columns={columns}
    />
  );
}
