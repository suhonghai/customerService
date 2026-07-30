import { Modal, Form, Input } from 'antd';

export interface DictTypeFormValues {
  code: string;
  name: string;
  remark?: string;
}

export interface DictTypeFormModalProps {
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: DictTypeFormValues) => void;
}

/**
 * 新增字典类型弹窗。
 *
 * 内部用 Form.useForm 持有表单态。code 字段强制正则校验(字母数字下划线连字符)。
 * 打开时通过 destroyOnHidden 清理旧值,Modal 关闭后 form 也跟着销毁。
 */
export function DictTypeFormModal({ open, loading, onCancel, onSubmit }: DictTypeFormModalProps) {
  const [form] = Form.useForm<DictTypeFormValues>();

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
    } catch {
      // antd Form validateFields 在校验失败时 reject;UI 已经在字段下显示错误,
      // 这里不需要上抛(测试环境也不希望看到 Unhandled Rejection)。
    }
  };

  return (
    <Modal
      title="新增字典类型"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form<DictTypeFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="code"
          label="编码"
          rules={[
            { required: true, min: 1, max: 50 },
            { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅允许字母、数字、下划线、连字符' },
          ]}
        >
          <Input placeholder="如 order_status" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, max: 100 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
