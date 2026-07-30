import { Button, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { MenuListItem } from '@/services/menu';
import { TYPE_COLOR, TYPE_LABEL } from './menu-constants';

export interface MenuTableProps {
  data: MenuListItem[];
  loading?: boolean;
  pageSize?: number;
  onEdit: (m: MenuListItem) => void;
  onDelete: (id: number) => void;
}

/**
 * 菜单表格 — 列定义 + 行内编辑/删除按钮。
 *
 * 11 列(ID / 名称+类型 tag / 路径 / 组件 / 图标 / 权限码 / 排序 / 可见 / 状态 / 操作)。
 * 纯展示 + 事件回调,不持有任何业务状态。
 */
export function MenuTable({ data, loading, pageSize = 50, onEdit, onDelete }: MenuTableProps) {
  const columns: ColumnsType<MenuListItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '名称',
      dataIndex: 'name',
      render: (n: string, r: MenuListItem) => (
        <Space>
          <span>{n}</span>
          <Tag color={TYPE_COLOR[r.type] || 'default'}>{TYPE_LABEL[r.type] || '-'}</Tag>
        </Space>
      ),
    },
    {
      title: '路径',
      dataIndex: 'path',
      render: (p: string | null) => p || <Tag>无</Tag>,
    },
    { title: '组件', dataIndex: 'component', ellipsis: true },
    { title: '图标', dataIndex: 'icon', width: 100 },
    {
      title: '权限码',
      dataIndex: 'permCode',
      width: 160,
      render: (p: string | null) => (p ? <Tag color="purple">{p}</Tag> : <Tag>无</Tag>),
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '可见',
      dataIndex: 'visible',
      width: 80,
      render: (v: boolean) => (v ? <Tag color="green">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: number) => (
        <Tag color={s === 1 ? 'green' : 'red'}>{s === 1 ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, m: MenuListItem) => (
        <Space>
          <PermissionButton permCode="menu:update">
            <Button size="small" onClick={() => onEdit(m)}>
              编辑
            </Button>
          </PermissionButton>
          <PermissionButton permCode="menu:delete">
            <Popconfirm title="确认删除?" onConfirm={() => onDelete(m.id)}>
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
    pageSize,
    showSizeChanger: false,
  };

  return (
    <Table<MenuListItem>
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={pagination}
      columns={columns}
    />
  );
}
