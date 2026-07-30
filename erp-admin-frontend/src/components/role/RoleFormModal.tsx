import { Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { RoleListItem } from '@/services/role';
import {
  CODE_PATTERN,
  DATA_SCOPE_OPTIONS,
  DEFAULT_ROLE_VALUES,
  STATUS_OPTIONS,
} from './role-constants';

/**
 * RoleForm 表单字段类型,覆盖 CreateRoleDto / UpdateRoleDto 公共子集。
 */
export interface RoleFormValues {
  code: string;
  name: string;
  description?: string;
  dataScope?: number;
  sort?: number;
  status?: number;
}

export interface RoleFormModalProps {
  open: boolean;
  editing: RoleListItem | null;
  form: FormInstance<RoleFormValues>;
  loading: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * Role 新增/编辑 Modal —— Modal + Form 字段组合。
 *
 * - editing 模式下 code 字段 disabled(编码创建后不可改,跟原实现保持一致)
 * - code 字段在新增模式下规则 = required + 长度 + 正则,编辑模式只校验长度/正则(可选改)
 * - dataScope / status 用 Select;sort 用 InputNumber
 * - 提交按钮 loading + onSubmit 由父级 controlled
 */
export function RoleFormModal({
  open,
  editing,
  form,
  loading,
  onCancel,
  onSubmit,
}: RoleFormModalProps) {
  return (
    <Modal
      title={editing ? '编辑角色' : '新增角色'}
      open={open}
      onCancel={onCancel}
      onOk={onSubmit}
      confirmLoading={loading}
      width={520}
      destroyOnHidden
    >
      <Form<RoleFormValues>
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={editing ? undefined : DEFAULT_ROLE_VALUES}
      >
        <Form.Item
          name="code"
          label="编码"
          rules={[
            { required: !editing, message: '请输入编码' },
            { min: 2, max: 50 },
            { pattern: CODE_PATTERN, message: '仅支持字母、数字、下划线、冒号、连字符' },
          ]}
        >
          <Input disabled={!!editing} placeholder="如 admin / ops" />
        </Form.Item>
        <Form.Item name="name" label="名称" rules={[{ required: true, max: 50 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="dataScope" label="数据权限" initialValue={1}>
          <Select options={DATA_SCOPE_OPTIONS} />
        </Form.Item>
        <Form.Item name="sort" label="排序" initialValue={0}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="status" label="状态" initialValue={1}>
          <Select options={STATUS_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
