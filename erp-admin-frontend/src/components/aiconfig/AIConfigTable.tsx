import { Table, Tag, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { AIConfig } from '@/hooks/use-ai-configs';

export interface AIConfigTableProps {
  data: AIConfig[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onEdit: (row: AIConfig) => void;
  onDelete: (id: number) => void;
  onSetDefault: (id: number) => void;
  onTest: (row: AIConfig) => void;
}

/**
 * 脱敏展示 API Key:首 3 + **** + 尾 4。
 * - 长度不足 7 时原样返回(异常 key 不强行截断)
 * - 空值返回空串
 */
export function maskApiKey(k: string | undefined | null): string {
  if (!k) return '';
  if (k.length < 7) return k;
  return `${k.slice(0, 3)}****-****-****-${k.slice(-4)}`;
}

/**
 * AI 模型配置表格 — 列定义 + 行内操作按钮。
 *
 * 纯展示 + 事件回调,不持有任何业务状态。
 */
export function AIConfigTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onEdit,
  onDelete,
  onSetDefault,
  onTest,
}: AIConfigTableProps) {
  const columns: ColumnsType<AIConfig> = [
    { title: '代码', dataIndex: 'code', width: 180 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: 'Provider', dataIndex: 'provider', width: 110 },
    { title: 'Model', dataIndex: 'modelId', width: 160 },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      width: 220,
      render: (k: string) => maskApiKey(k) || '-',
    },
    {
      title: '温度',
      dataIndex: 'temperature',
      width: 80,
      render: (v: number | undefined) => v ?? '-',
    },
    {
      title: '默认',
      dataIndex: 'isDefault',
      width: 80,
      render: (v: boolean | undefined) =>
        v ? <Tag color="green">默认</Tag> : <span style={{ color: '#bbb' }}>-</span>,
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
      width: 280,
      render: (_, r: AIConfig) => (
        <Space wrap>
          <PermissionButton permCode="ai-config:test">
            <Button size="small" onClick={() => onTest(r)}>
              测试
            </Button>
          </PermissionButton>
          {!r.isDefault && (
            <PermissionButton permCode="ai-config:update">
              <Button size="small" onClick={() => onSetDefault(r.id)}>
                设默认
              </Button>
            </PermissionButton>
          )}
          <PermissionButton permCode="ai-config:update">
            <Button size="small" onClick={() => onEdit(r)}>
              编辑
            </Button>
          </PermissionButton>
          <PermissionButton permCode="ai-config:delete">
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
    onChange: onPageChange,
  };

  return (
    <Table<AIConfig>
      rowKey="id"
      loading={loading}
      dataSource={data}
      columns={columns}
      pagination={pagination}
    />
  );
}
