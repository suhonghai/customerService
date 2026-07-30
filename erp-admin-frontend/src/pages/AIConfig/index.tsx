import { useState } from 'react';
import { Button, Space, Form, Modal, message } from 'antd';
import { AIConfigTable } from '@/components/aiconfig/AIConfigTable';
import { AIConfigForm, DEFAULT_VALUES } from '@/components/aiconfig/AIConfigForm';
import { TestModelModal } from '@/components/aiconfig/TestModelModal';
import { PermissionButton } from '@/components/PermissionButton';
import {
  useAIConfigList,
  useCreateAIConfig,
  useUpdateAIConfig,
  useDeleteAIConfig,
  useSetDefaultAIConfig,
  useTestAIModel,
  type AIConfig,
  type TestModelResult,
} from '@/hooks/use-ai-configs';

/**
 * `/ai-config` — AI 模型配置列表 + 新增 / 编辑 / 测试。
 *
 * 业务逻辑(state 协调 / 拉列表 / 提交 / 删除)留在 page 层,
 * 纯展示 Table / Form / Test 弹窗 拆分到 components/aiconfig/*。
 */
export default function AIConfigPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editing, setEditing] = useState<AIConfig | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestModelResult | null>(null);
  const [form] = Form.useForm();

  const { data, isLoading } = useAIConfigList({ page, pageSize });
  const createMut = useCreateAIConfig();
  const updateMut = useUpdateAIConfig();
  const deleteMut = useDeleteAIConfig();
  const setDefaultMut = useSetDefaultAIConfig();
  const testMut = useTestAIModel();

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(DEFAULT_VALUES);
    setFormModalOpen(true);
  };

  const openEdit = (r: AIConfig) => {
    setEditing(r);
    form.setFieldsValue(r);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleOk = async () => {
    const v = await form.validateFields();
    if (editing) {
      updateMut.mutate({ id: editing.id, dto: v }, { onSuccess: () => closeFormModal() });
    } else {
      createMut.mutate(v, { onSuccess: () => closeFormModal() });
    }
  };

  const openTest = (r: AIConfig) => {
    setEditing(r);
    setTestResult(null);
    setTestModalOpen(true);
  };

  const closeTest = () => {
    setTestModalOpen(false);
    setTestResult(null);
  };

  const submitTest = (prompt: string) => {
    if (!editing) return;
    testMut.mutate(
      { id: editing.id, prompt },
      {
        onSuccess: (res) => {
          setTestResult(res);
          message.success('测试完成');
        },
        onError: (e) => {
          setTestResult({ error: (e as Error).message });
        },
      },
    );
  };

  return (
    <div style={{ padding: 'var(--content-padding)' }}>
      <Space style={{ marginBottom: 16 }}>
        <PermissionButton permCode="ai-config:create">
          <Button type="primary" onClick={openCreate}>
            新增配置
          </Button>
        </PermissionButton>
      </Space>

      <AIConfigTable
        data={(data?.list || []) as AIConfig[]}
        loading={isLoading}
        page={page}
        pageSize={pageSize}
        total={data?.total || 0}
        onPageChange={setPage}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
        onSetDefault={(id) => setDefaultMut.mutate(id)}
        onTest={openTest}
      />

      <Modal
        title={editing ? '编辑配置' : '新增配置'}
        open={formModalOpen}
        onCancel={closeFormModal}
        onOk={handleOk}
        confirmLoading={createMut.isPending || updateMut.isPending}
        width={640}
      >
        <AIConfigForm form={form} editing={editing} />
      </Modal>

      <TestModelModal
        open={testModalOpen}
        config={editing}
        loading={testMut.isPending}
        result={testResult}
        onCancel={closeTest}
        onSubmit={submitTest}
      />
    </div>
  );
}
