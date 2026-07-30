import { Form, Input, Button, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { LockOutlined, UserOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { DemoAccounts } from './DemoAccounts';
import type { LoginFormValues } from './login-constants';

const { Text } = Typography;

export interface LoginFormPanelProps {
  form: FormInstance<LoginFormValues>;
  loading: boolean;
  errMsg: string | null;
  onSubmit: (values: LoginFormValues) => void;
  /** 点击 demo chip 时由父级回填表单 */
  onFillDemo: (username: string, password: string) => void;
}

/**
 * 登录表单右侧 panel —— 标题 + 表单 + demo 账号 chips。
 *
 * 渲染标题、错误提示、username/password 字段、submit 按钮和 demo chip 区。
 * 提交按钮 loading 由父级 controlled,错误信息由父级注入。
 */
export function LoginFormPanel({
  form,
  loading,
  errMsg,
  onSubmit,
  onFillDemo,
}: LoginFormPanelProps) {
  return (
    <div
      className="auth-form"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px 72px',
        background: 'var(--bg-app)',
      }}
    >
      <div style={{ maxWidth: 360, width: '100%', margin: '0 auto' }}>
        <div className="section-tag" style={{ marginBottom: 16 }}>
          <span className="num">§ 01</span>
          <span>Credentials / 凭证</span>
        </div>

        <h2
          style={{
            fontSize: 28,
            fontWeight: 500,
            margin: 0,
            marginBottom: 8,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          Welcome back.
        </h2>
        <Text
          style={{
            display: 'block',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginBottom: 32,
            lineHeight: 1.6,
          }}
        >
          输入你的账号信息继续
        </Text>

        {errMsg && (
          <div
            role="alert"
            data-testid="login-error"
            style={{
              padding: '10px 14px',
              marginBottom: 20,
              background: 'var(--color-danger-bg)',
              borderLeft: '2px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {/* ! {errMsg} */}
            {`! ${errMsg}`}
          </div>
        )}

        <Form<LoginFormValues>
          form={form}
          layout="vertical"
          onFinish={onSubmit}
          initialValues={{ username: '', password: '' }}
          requiredMark={false}
        >
          <Form.Item
            name="username"
            label={
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                }}
              >
                Username
              </span>
            }
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="admin"
              size="large"
              autoComplete="username"
              style={{ height: 44, fontFamily: 'var(--font-mono)' }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label={
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                }}
              >
                Password
              </span>
            }
            rules={[{ required: true, message: '请输入密码' }]}
            style={{ marginBottom: 28 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: 'var(--text-tertiary)' }} />}
              placeholder="••••••••"
              size="large"
              autoComplete="current-password"
              style={{ height: 44, fontFamily: 'var(--font-mono)' }}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            style={{
              height: 46,
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 14,
              letterSpacing: '0.02em',
            }}
          >
            Continue
          </Button>
        </Form>

        <DemoAccounts onFill={onFillDemo} />
      </div>
    </div>
  );
}
