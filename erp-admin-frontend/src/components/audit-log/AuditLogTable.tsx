import { Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AuditLogListItem } from '@/services/audit-log';
import { fmtDate, statusColor, statusLabel } from './audit-log-utils';

export interface AuditLogTableProps {
  data: AuditLogListItem[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onDetail: (row: AuditLogListItem) => void;
}

/**
 * AuditLog 表格 — 10 列(时间/用户/模块/动作/资源/方法/路径/状态/耗时/操作)
 *
 * 纯展示 + 事件回调,不持有任何业务状态。详情按钮触发 onDetail,由父组件
 * 决定何时打开抽屉。
 */
export function AuditLogTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
}: AuditLogTableProps) {
  const columns: ColumnsType<AuditLogListItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (d: string) => fmtDate(d),
    },
    {
      title: '用户',
      dataIndex: 'username',
      width: 120,
      render: (v: string | null) => v || '-',
    },
    { title: '模块', dataIndex: 'module', width: 100 },
    { title: '动作', dataIndex: 'action', width: 100 },
    {
      title: '资源',
      dataIndex: 'resource',
      width: 140,
      render: (v: string | null, r) => (v ? `${v}${r.resourceId ? `#${r.resourceId}` : ''}` : '-'),
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 80,
      render: (v: string | null) => (v ? <Tag>{v}</Tag> : '-'),
    },
    {
      title: '路径',
      dataIndex: 'path',
      width: 220,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: number) => <Tag color={statusColor(s)}>{statusLabel(s)}</Tag>,
    },
    {
      title: '耗时',
      dataIndex: 'costMs',
      width: 90,
      render: (v: number | null) => (v == null ? '-' : `${v}ms`),
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_, r) => <a onClick={() => onDetail(r)}>详情</a>,
    },
  ];

  return (
    <Table<AuditLogListItem>
      rowKey="id"
      loading={loading}
      dataSource={data}
      scroll={{ x: 1200 }}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        onChange: onPageChange,
      }}
      columns={columns}
    />
  );
}
