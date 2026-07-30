import { Table, Button, Space, Tag, Popconfirm } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { DictItem } from '@/services/dict';

export interface DictItemTableProps {
  data: DictItem[];
  loading?: boolean;
  onEdit: (row: DictItem) => void;
  onDelete: (id: number) => void;
  /** 当前选中的字典类型(用于卡片标题),null 则不渲染 */
  selectedTypeName: string | null;
}

/**
 * 字典项列表。
 *
 * 选中类型为空时不渲染整个卡片(避免空表头误导用户)。
 * 选中态 / 行事件 / 编辑 / 删除 全部上抛 — 不持有任何业务状态。
 */
export function DictItemTable({
  data,
  loading,
  onEdit,
  onDelete,
  selectedTypeName,
}: DictItemTableProps) {
  if (!selectedTypeName) {
    // 类型未选中时不渲染整张卡片(也避免 React 报 nested table warning)
    return null;
  }

  const columns: ColumnsType<DictItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '标签', dataIndex: 'label', width: 140 },
    { title: '值', dataIndex: 'value', width: 140 },
    {
      title: '颜色',
      dataIndex: 'cssClass',
      width: 100,
      render: (v: string | null) =>
        v ? <Tag color={v}>{v}</Tag> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
    },
    { title: '排序', dataIndex: 'sort', width: 80 },
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 80,
      render: (b: boolean) =>
        b ? <Tag color="blue">是</Tag> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      ellipsis: true,
      render: (v: string | null) => v || <span style={{ color: 'var(--text-tertiary)' }}>—</span>,
    },
    {
      title: '操作',
      width: 160,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <PermissionButton permCode="dict:update">
            <Button size="small" type="text" onClick={() => onEdit(r)}>
              编辑
            </Button>
          </PermissionButton>
          <PermissionButton permCode="dict:delete">
            <Popconfirm title="确认删除?" onConfirm={() => onDelete(r.id)}>
              <Button size="small" type="text" danger>
                删除
              </Button>
            </Popconfirm>
          </PermissionButton>
        </Space>
      ),
    },
  ];

  return (
    <Table<DictItem>
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={data}
      pagination={false}
      columns={columns}
    />
  );
}
