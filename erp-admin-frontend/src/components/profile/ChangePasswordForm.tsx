import { Form, Input, Button } from 'antd';
import type { FormInstance } from 'antd';
import { PASSWORD_RULES } from './profile-constants';

export interface ChangePasswordValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordFormProps {
  form: FormInstance<ChangePasswordValues>;
  /** mutation 提交中,显示按钮 loading */
  loading: boolean;
  /** 表单校验通过后回调,父级负责调 changePassword API */
  onSubmit: (vals: { oldPassword: string; newPassword: string }) => void;
}

/**
 * 修改密码表单 — 3 个字段 + 校验规则。
 *
 * - 旧密码:必填,至少 6 位
 * - 新密码:必填,长度 6-50,且不能与旧密码相同
 * - 确认密码:必填,必须与新密码一致
 *
 * Form 校验通过后通过 onSubmit 上抛,父级统一处理 API + 跳 /login 业务逻辑。
 * 这里不持有 mutation / navigate / setTimeout 等副作用。
 */
export function ChangePasswordForm({ form, loading, onSubmit }: ChangePasswordFormProps) {
  return (
    <Form<ChangePasswordValues>
      form={form}
      layout="vertical"
      style={{ maxWidth: 480 }}
      onFinish={(vals) =>
        onSubmit({
          oldPassword: vals.oldPassword,
          newPassword: vals.newPassword,
        })
      }
    >
      <Form.Item
        name="oldPassword"
        label="当前密码"
        rules={[{ required: true, min: PASSWORD_RULES.MIN }]}
      >
        <Input.Password placeholder="请输入当前密码" />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label="新密码"
        rules={[
          { required: true, min: PASSWORD_RULES.MIN, max: PASSWORD_RULES.MAX },
          {
            validator: (_, v) =>
              v && v === form.getFieldValue('oldPassword')
                ? Promise.reject(new Error('新密码不能与旧密码相同'))
                : Promise.resolve(),
          },
        ]}
      >
        <Input.Password placeholder="至少 6 位" />
      </Form.Item>
      <Form.Item
        name="confirmPassword"
        label="确认新密码"
        dependencies={['newPassword']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator(_, v) {
              if (!v || getFieldValue('newPassword') === v) {
                return Promise.resolve();
              }
              return Promise.reject(new Error('两次输入的密码不一致'));
            },
          }),
        ]}
      >
        <Input.Password placeholder="再输入一次新密码" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={loading}>
          保存
        </Button>
      </Form.Item>
    </Form>
  );
}
