import { useState } from 'react';
import { Form } from 'antd';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { login, fetchMe } from '@/services/auth';
import { useAuthStore, type UserRole } from '@/stores/auth';
import { LoginHero } from '@/components/login/LoginHero';
import { LoginFormPanel } from '@/components/login/LoginFormPanel';
import type { LoginFormValues } from '@/components/login/login-constants';

interface FromState {
  from?: { pathname?: string };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setTokens = useAuthStore((s) => s.setTokens);
  const setUserInfo = useAuthStore((s) => s.setUserInfo);

  const [form] = Form.useForm<LoginFormValues>();
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  const submit = async (values: LoginFormValues) => {
    setLoading(true);
    setErrMsg(null);
    try {
      const res = await login(values);
      setTokens(res.accessToken, res.refreshToken);
      const me = await fetchMe();
      const roles: UserRole[] = (me.roles || []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
      }));
      setUserInfo({
        id: me.id,
        username: me.username,
        nickname: me.nickname,
        email: me.email,
        avatar: me.avatar,
        roles,
        permissions: me.permissions || [],
      });
      const from = (location.state as FromState)?.from?.pathname;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (username: string, password: string) => {
    form.setFieldsValue({ username, password });
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(420px, 480px)',
        background: 'var(--bg-app)',
      }}
      className="auth-grid reveal"
    >
      <LoginHero dateStr={dateStr} />
      <LoginFormPanel
        form={form}
        loading={loading}
        errMsg={errMsg}
        onSubmit={submit}
        onFillDemo={fillDemo}
      />
    </div>
  );
}
