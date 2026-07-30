import { Table, Tag, Button, Space, Popconfirm } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { PermissionButton } from '@/components/PermissionButton';
import type { FAQ } from '@/hooks/use-faqs';

export interface FAQTableProps {
  data: FAQ[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onDetail: (row: FAQ) => void;
  onPublish: (row: FAQ) => void;
  onOffline: (row: FAQ) => void;
  onDelete: (row: FAQ) => void;
}

/**
 * FAQ 状态 → 中文 Tag 配置(集中放在组件顶部,方便复用 / 单测)。
 */
export const FAQ_STATUS_META: Record<number, { color: string; label: string }> = {
  0: { color: 'default', label: '草稿' },
  1: { color: 'orange', label: '待审核' },
  2: { color: 'green', label: '已发布' },
  3: { color: 'red', label: '已下线' },
};

/**
 * FAQ 表格 — 列定义 + 行内操作按钮。
 *
 * 状态语义(对齐后端 faq.service):
 *   - 0 草稿 → 可发可删
 *   - 1 待审核 → 可发可删
 *   - 2 已发布 → 可下线可删
 *   - 3 已下线 → 可删
 *
 * 纯展示 + 事件回调,不持有任何业务状态。
 */
export function FAQTable({
  data,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  onDetail,
  onPublish,
  onOffline,
  onDelete,
}: FAQTableProps) {
  const columns: ColumnsType<FAQ> = [
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 120 },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 160,
      render: (t?: string) =>
        t ? t.split(',').map((tag) => <Tag key={tag.trim()}>{tag.trim()}</Tag>) : '-',
    },
    { title: '当前版本', dataIndex: 'currentVersion', width: 100 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (s: number) => {
        const meta = FAQ_STATUS_META[s] || { color: 'default', label: '未知' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
    },
    {
      title: '操作',
      width: 260,
      render: (_, r: FAQ) => (
        <Space wrap>
          <Button size="small" onClick={() => onDetail(r)}>
            详情
          </Button>
          {r.status !== 2 && (
            <PermissionButton permCode="faq:review">
              <Button size="small" type="primary" onClick={() => onPublish(r)}>
                发布
              </Button>
            </PermissionButton>
          )}
          {r.status === 2 && (
            <PermissionButton permCode="faq:review">
              <Button size="small" onClick={() => onOffline(r)}>
                下线
              </Button>
            </PermissionButton>
          )}
          <PermissionButton permCode="faq:delete">
            <Popconfirm title="确认删除?" onConfirm={() => onDelete(r)}>
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
    <Table<FAQ>
      rowKey="id"
      loading={loading}
      dataSource={data}
      columns={columns}
      pagination={pagination}
    />
  );
}
