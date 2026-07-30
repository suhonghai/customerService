import { useState } from 'react';
import { Button, Space, Drawer, Form, Input, Select, message } from 'antd';
import { PromptTemplateTable } from '@/components/aiconfig/PromptTemplate/PromptTemplateTable';
import { PromptTemplateForm } from '@/components/aiconfig/PromptTemplate/PromptTemplateForm';
import { PermissionButton } from '@/components/PermissionButton';
import {
  usePromptTemplateList,
  useCreatePromptTemplate,
  useUpdatePromptTemplate,
  useDeletePromptTemplate,
} from '@/hooks/use-prompt-templates';
import { parseVariables } from '@/services/ai-prompt-template';
import type { AiPromptTemplate, CreateAiPromptTemplateDto } from '@/services/ai-prompt-template';

/**
 * `/ai-config/prompt` 子页 — Prompt 模板管理 UI。
 *
 * 业务逻辑(stat 协调 / 拉列表 / 提交 / 删除)留在 page 层,
 * 纯展示 Table / Form / Diff 拆分到 components/aiconfig/PromptTemplate/*。
 */
export default function PromptTemplatePage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AiPromptTemplate | null>(null);
  const [form] = Form.useForm<CreateAiPromptTemplateDto & { variables: string[] }>();

  const { data, isLoading, refetch } = usePromptTemplateList({
    page,
    pageSize,
    status: filterStatus,
    code: keyword || undefined,
  });
  const createMut = useCreatePromptTemplate();
  const updateMut = useUpdatePromptTemplate();
  const deleteMut = useDeletePromptTemplate();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 1, variables: [] });
    setDrawerOpen(true);
  };

  const openEdit = (r: AiPromptTemplate) => {
    setEditing(r);
    form.setFieldsValue({
      code: r.code,
      name: r.name,
      content: r.content,
      variables: parseVariables(r.variables),
      status: r.status,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const submit = async () => {
    const v = await form.validateFields();
    const dto: CreateAiPromptTemplateDto = {
      code: v.code,
      name: v.name,
      content: v.content,
      // 后端要求 variables 是 JSON 数组字符串
      variables: JSON.stringify(v.variables ?? []),
      status: v.status,
    };
    if (editing) {
      updateMut.mutate(
        { id: editing.id, ...dto },
        { onSuccess: () => message.success('更新成功') },
      );
    } else {
      createMut.mutate(dto, { onSuccess: () => message.success('创建成功') });
    }
    closeDrawer();
  };

  return (
    <div style={{ padding: 'var(--content-padding)' }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="搜索 code / name"
          allowClear
          style={{ width: 240 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 140 }}
          onChange={(v) => {
            setFilterStatus(v);
            setPage(1);
          }}
          options={[
            { value: 1, label: '启用' },
            { value: 0, label: '禁用' },
          ]}
        />
        <Button onClick={() => refetch()}>刷新</Button>
        <PermissionButton permCode="ai-config:create">
          <Button type="primary" onClick={openCreate}>
            新增模板
          </Button>
        </PermissionButton>
      </Space>

      <PromptTemplateTable
        data={(data?.list || []) as AiPromptTemplate[]}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total || 0}
        onPageChange={setPage}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
      />

      <Drawer
        title={editing ? '编辑 Prompt 模板' : '新增 Prompt 模板'}
        open={drawerOpen}
        onClose={closeDrawer}
        width={640}
        extra={
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button
              type="primary"
              onClick={submit}
              loading={createMut.isPending || updateMut.isPending}
            >
              保存
            </Button>
          </Space>
        }
      >
        <PromptTemplateForm form={form} editing={editing} />
      </Drawer>
    </div>
  );
}
