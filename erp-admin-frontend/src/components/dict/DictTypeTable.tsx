import { Table, Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { DictType } from '@/services/dict';

export interface DictTypeTableProps {
  data: DictType[];
  loading?: boolean;
  selectedId?: number;
  onSelect: (row: DictType) => void;
  onDelete: (row: DictType) => void;
}

/**
 * 字典类型列表。
 *
 * 纯展示 + 事件回调,选中态通过 rowClassName + `ant-table-row-selected` 标识。
 * 行点击 / 删除按钮各自走独立回调 — 不持有任何业务状态。
 */
export function DictTypeTable({
  data,
  loading,
  selectedId,
  onSelect,
  onDelete,
}: DictTypeTableProps) {
  const columns: ColumnsType<DictType> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '编码', dataIndex: 'code', width: 160 },
    { title: '名称', dataIndex: 'name', width: 160 },
    {
      title: '项数',
      dataIndex: 'activeItemCount',
      width: 100,
      render: (v: number, r) => (
        <span>
          <Tag color="blue">{v}</Tag>
          <span style={{ color: 'var(--text-tertiary)' }}>/ {r.itemCount}</span>
        </span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      ellipsis: true,
      render: (v: string | null) => v || <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (d: string) => (d ? new Date(d).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      render: (_, r) => (
        <PermissionButton permCode="dict:delete">
          <Button
            size="small"
            danger
            onClick={(e) => {
              e.stopPropagation();
              onDelete(r);
            }}
          >
            删除
          </Button>
        </PermissionButton>
      ),
    },
  ];

  return (
    <Table<DictType>
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={data}
      pagination={false}
      rowClassName={(r) => (r.id === selectedId ? 'ant-table-row-selected' : '')}
      onRow={(r) => ({
        onClick: () => onSelect(r),
        style: { cursor: 'pointer' },
      })}
      columns={columns}
    />
  );
}
