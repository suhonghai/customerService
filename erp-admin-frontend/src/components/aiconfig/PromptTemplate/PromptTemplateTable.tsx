import { Table, Tag, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import { parseVariableList } from '@/utils/variables';
import type { AiPromptTemplate } from '@/services/ai-prompt-template';

export interface PromptTemplateTableProps {
  data: AiPromptTemplate[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onEdit: (row: AiPromptTemplate) => void;
  onDelete: (id: number) => void;
}

/**
 * Prompt 模板列表 — 列定义 + 行内操作按钮。
 *
 * 模板内容预览:超过 50 字符截断 + 省略号;
 * variables 后端存的是 JSON 字符串,展示时解析成 Tag 列表。
 */
export function PromptTemplateTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onEdit,
  onDelete,
}: PromptTemplateTableProps) {
  const columns: ColumnsType<AiPromptTemplate> = [
    { title: 'Code', dataIndex: 'code', width: 180 },
    { title: '名称', dataIndex: 'name', width: 180 },
    {
      title: '模板内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v: string) => (
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}
        >
          {v.length > 50 ? `${v.slice(0, 50)}…` : v}
        </span>
      ),
    },
    {
      title: '变量',
      dataIndex: 'variables',
      width: 220,
      render: (v: string | null) => {
        const list = parseVariableList(v);
        if (list.length === 0) return <span style={{ color: '#bbb' }}>-</span>;
        return (
          <Space size={[4, 4]} wrap>
            {list.map((name) => (
              <Tag key={name} style={{ margin: 0 }}>
                {name}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: number) => (
        <Tag color={s === 1 ? 'green' : 'red'}>{s === 1 ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 200,
      render: (_, r: AiPromptTemplate) => (
        <Space wrap>
          <PermissionButton permCode="ai-config:update">
            <Button size="small" onClick={() => onEdit(r)}>
              编辑
            </Button>
          </PermissionButton>
          <PermissionButton permCode="ai-config:delete">
            <Popconfirm
              title="确认删除?"
              description={`将删除「${r.name}」,不可恢复`}
              onConfirm={() => onDelete(r.id)}
            >
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
    <Table<AiPromptTemplate>
      rowKey="id"
      loading={loading}
      dataSource={data}
      columns={columns}
      pagination={pagination}
    />
  );
}
