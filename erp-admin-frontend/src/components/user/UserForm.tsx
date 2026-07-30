import { Button, Form, Input, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { CreateUserDto, UserListItem } from '@/services/user';
import { STATUS_OPTIONS } from './user-constants';

export interface UserFormProps {
  form: FormInstance<CreateUserDto>;
  editing: UserListItem | null;
  onSubmit?: (values: CreateUserDto) => void;
}

export function UserForm({ form, editing, onSubmit }: UserFormProps) {
  return (
    <Form
      form={form}
      layout="vertical"
      preserve={false}
      onFinish={onSubmit}
      initialValues={{ status: 1 }}
    >
      <Form.Item
        name="username"
        label="Username"
        rules={[{ required: !editing, message: '请输入用户名', min: 3, max: 50 }]}
      >
        <Input disabled={!!editing} placeholder="3-50 字符" />
      </Form.Item>
      {!editing && (
        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: '请输入密码', min: 6, max: 50 }]}
        >
          <Input.Password placeholder="至少 6 位" />
        </Form.Item>
      )}
      <Form.Item name="nickname" label="Nickname">
        <Input />
      </Form.Item>
      <Form.Item name="email" label="Email" rules={[{ type: 'email', message: '请输入有效邮箱' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="phone" label="Phone">
        <Input />
      </Form.Item>
      <Form.Item name="status" label="Status">
        <Select options={STATUS_OPTIONS} />
      </Form.Item>
      <Form.Item name="remark" label="Remark">
        <Input.TextArea rows={2} />
      </Form.Item>
      {onSubmit && <Button htmlType="submit">Submit</Button>}
    </Form>
  );
}
