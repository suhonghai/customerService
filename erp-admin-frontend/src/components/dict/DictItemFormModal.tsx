import { useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Switch, Select } from 'antd';
import { CSS_CLASS_OPTIONS } from './dict-constants';
import type { DictItem } from '@/services/dict';

export interface DictItemFormValues {
  label: string;
  value: string;
  sort?: number;
  isDefault?: boolean;
  cssClass?: string;
  remark?: string;
}

export interface DictItemFormModalProps {
  open: boolean;
  editing: DictItem | null;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (values: DictItemFormValues) => void;
}

/**
 * 新增 / 编辑字典项弹窗。
 *
 * editing === null → 新增(默认值 sort=0, isDefault=false);
 * editing !== null → 编辑(回填 editing 各项字段)。
 */
export function DictItemFormModal({
  open,
  editing,
  loading,
  onCancel,
  onSubmit,
}: DictItemFormModalProps) {
  const [form] = Form.useForm<DictItemFormValues>();

  // 打开时根据 editing 模式回填表单
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        label: editing.label,
        value: editing.value,
        sort: editing.sort,
        isDefault: editing.isDefault,
        cssClass: editing.cssClass || undefined,
        remark: editing.remark || undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ sort: 0, isDefault: false });
    }
  }, [open, editing, form]);

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
      title={editing ? '编辑字典项' : '新增字典项'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form<DictItemFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item name="label" label="标签" rules={[{ required: true, max: 100 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="value" label="值" rules={[{ required: true, max: 100 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="cssClass" label="颜色(Antd Tag 颜色)">
          <Select allowClear placeholder="如 blue / green / red" options={CSS_CLASS_OPTIONS} />
        </Form.Item>
        <Form.Item name="sort" label="排序" initialValue={0}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="isDefault" label="是否默认" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
