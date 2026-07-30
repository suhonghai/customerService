import { Avatar, Button, Card, Popconfirm, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { UserListItem } from '@/services/user';
import { ROLE_COLOR, STATUS_LABEL } from './user-constants';

const { Text } = Typography;

export interface UserTableProps {
  data: UserListItem[];
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number, pageSize: number) => void;
  onEdit: (user: UserListItem) => void;
  onDelete: (id: number) => void;
}

export function UserTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onEdit,
  onDelete,
}: UserTableProps) {
  const columns: ColumnsType<UserListItem> = [
    {
      title: '#',
      dataIndex: 'id',
      width: 64,
      render: (id: number) => (
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {String(id).padStart(4, '0')}
        </span>
      ),
    },
    {
      title: 'User',
      dataIndex: 'username',
      render: (_, user) => (
        <Space size={12}>
          <Avatar
            size={32}
            style={{
              background: 'var(--bg-sunken)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            {(user.nickname || user.username).charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 15,
                letterSpacing: '-0.01em',
              }}
            >
              {user.nickname || user.username}
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              @{user.username}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      render: (email: string | null) => email || <Text type="secondary">—</Text>,
    },
    {
      title: 'Roles',
      dataIndex: 'roles',
      render: (roles: UserListItem['roles']) =>
        roles?.length ? (
          <Space size={4} wrap>
            {roles.map((role) => (
              <Tag
                key={role.id}
                color={ROLE_COLOR[role.code] || ROLE_COLOR.default}
                className="tag-info"
                style={{ margin: 0 }}
              >
                {role.code}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (status: number) => {
        const meta = STATUS_LABEL[status] || { label: 'unknown', className: 'tag-neutral' };
        return (
          <Tag className={meta.className} style={{ margin: 0 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      width: 130,
      render: (date: string) =>
        date ? (
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-regular)' }}>
            {new Date(date).toISOString().slice(0, 10)}
          </span>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, user) => (
        <Space size={4}>
          <PermissionButton permCode="user:update">
            <Button size="small" type="link" onClick={() => onEdit(user)}>
              Edit
            </Button>
          </PermissionButton>
          <PermissionButton permCode="user:delete">
            <Popconfirm title="确认删除?" onConfirm={() => onDelete(user.id)}>
              <Button size="small" type="link" danger>
                Delete
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
    showTotal: (count) => (
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {count} · records
      </span>
    ),
    onChange: onPageChange,
  };

  return (
    <Card
      className="reveal reveal-1"
      styles={{ body: { padding: 0 } }}
      style={{ overflow: 'hidden' }}
    >
      <div data-testid="user-table-loading" aria-busy={loading ? 'true' : 'false'}>
        <Spin spinning={!!loading}>
          <Table<UserListItem>
            rowKey="id"
            loading={false}
            dataSource={data}
            pagination={pagination}
            scroll={{ x: 800 }}
            columns={columns}
          />
        </Spin>
      </div>
    </Card>
  );
}
