import { Button, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { RoleListItem } from '@/services/role';
import { DATA_SCOPE_LABEL, STATUS_COLOR } from './role-constants';

export interface RoleTableProps {
  data: RoleListItem[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onEdit: (r: RoleListItem) => void;
  onAssignMenu: (r: RoleListItem) => void;
  onDelete: (id: number) => void;
}

/**
 * Role 表格 —— 9 列(ID / 编码 / 名称 / 描述 / 数据权限 / 排序 / 状态 / 内置 / 操作)
 *
 * - 内置角色 (builtin=true) 不渲染删除按钮
 * - 操作列:编辑 / 分配菜单 / 删除(删除仅非内置显示)
 * - 权限码通过 PermissionButton 控制,缺权限时不渲染
 * - 分页受控 (page / pageSize / total / onPageChange)
 */
export function RoleTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onEdit,
  onAssignMenu,
  onDelete,
}: RoleTableProps) {
  const columns: ColumnsType<RoleListItem> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '编码', dataIndex: 'code', width: 140 },
    { title: '名称', dataIndex: 'name', width: 140 },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '数据权限',
      dataIndex: 'dataScope',
      width: 100,
      render: (v: number) => <Tag>{DATA_SCOPE_LABEL[v] || '-'}</Tag>,
    },
    { title: '排序', dataIndex: 'sort', width: 70 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (s: number) => (
        <Tag color={STATUS_COLOR[s] || 'default'}>{s === 1 ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '内置',
      dataIndex: 'builtin',
      width: 80,
      render: (b: boolean) => (b ? <Tag color="blue">是</Tag> : '-'),
    },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      render: (_, r: RoleListItem) => (
        <Space>
          <PermissionButton permCode="role:update">
            <Button size="small" onClick={() => onEdit(r)}>
              编辑
            </Button>
          </PermissionButton>
          <PermissionButton permCode="role:assign-menu">
            <Button size="small" onClick={() => onAssignMenu(r)}>
              分配菜单
            </Button>
          </PermissionButton>
          {!r.builtin && (
            <PermissionButton permCode="role:delete">
              <Popconfirm title="确认删除?" onConfirm={() => onDelete(r.id)}>
                <Button size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </PermissionButton>
          )}
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
    <Table<RoleListItem>
      rowKey="id"
      loading={loading}
      dataSource={data}
      pagination={pagination}
      columns={columns}
    />
  );
}
