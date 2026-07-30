'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginRequest, fetchMe } from '@/lib/auth';

/**
 * V1 S5 终端用户登录页
 *
 * - 邮箱密码登录(主,CsAuthModule 独立认证)
 * - 手机号验证码登录(V1.1+ 接入,UI 已留入口,handler 暂提示「暂未开放」)
 *
 * 登录成功 → 写 httpOnly cookie(后端 Set-Cookie)+ 缓存 user 信息 → 跳 ?next 或 /
 * 已登录用户访问 /login → 自动跳 /
 *
 * 友好提示:
 * - 5 次失败锁 30 分钟 — 后端返 `邮箱或密码错误` 累计,前端只展示具体 message
 * - 内部员工账号由 AuthGuard 拦截并引导至 ERP 后台登录
 */

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/';
  const internalError = searchParams.get('err') === 'internal'; // AuthGuard: ?err=internal

  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneEnabled = process.env.NEXT_PUBLIC_AUTH_PHONE_ENABLED === 'true';
  const emailEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED !== 'false';

  // 已登录用户访问 /login → 自动跳走
  useEffect(() => {
    if (internalError) return;
    let cancelled = false;
    async function check() {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const me = await fetchMe(apiBase);
      if (cancelled) return;
      if (me) router.replace(nextPath);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath, internalError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      if (mode === 'email') {
        if (!email.trim() || !password) {
          setError('请输入邮箱和密码');
          return;
        }
        await loginRequest(email.trim(), password, apiBase);
      } else {
        // 手机号验证码 — V1.0 stub,留 TODO
        setError('手机号验证码登录暂未开放,请使用邮箱登录');
        return;
      }
      // 登录成功 → 跳目标页
      router.replace(nextPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '登录失败';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen px-4 py-8"
      style={{ background: 'var(--surface)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-lg p-8"
        style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 mb-6">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-2xl text-lg shadow-sm"
            style={{ background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)' }}
          >
            🛍️
          </span>
          <div>
            <h1 className="display font-bold text-xl leading-tight">小服客服</h1>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              登录后开始对话
            </div>
          </div>
        </div>

        {internalError && (
          <div
            className="mb-4 text-xs px-3 py-2 rounded-lg"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              color: 'rgb(185, 28, 28)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            内部员工请用 ERP 后台:http://localhost:5173
          </div>
        )}

        {/* 模式切换 */}
        <div className="flex border-b mb-6" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            disabled={!emailEnabled}
            onClick={() => setMode('email')}
            className="flex-1 pb-2 text-sm font-medium transition-colors"
            style={{
              color: mode === 'email' ? 'var(--brand-primary)' : 'var(--text-tertiary)',
              borderBottom:
                mode === 'email' ? '2px solid var(--brand-primary)' : '2px solid transparent',
              opacity: emailEnabled ? 1 : 0.4,
            }}
          >
            邮箱 + 密码
          </button>
          <button
            type="button"
            disabled={!phoneEnabled}
            onClick={() => setMode('phone')}
            className="flex-1 pb-2 text-sm font-medium transition-colors"
            style={{
              color: mode === 'phone' ? 'var(--brand-primary)' : 'var(--text-tertiary)',
              borderBottom:
                mode === 'phone' ? '2px solid var(--brand-primary)' : '2px solid transparent',
              opacity: phoneEnabled ? 1 : 0.4,
            }}
          >
            手机号验证
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'email' ? (
            <>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  邮箱
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="邮箱"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  密码
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  手机号
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 位手机号"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-xs font-medium mb-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  验证码
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 位验证码"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                手机号验证码登录 V1.1+ 开放(V1.0 暂仅邮箱 + 密码登录)
              </div>
            </>
          )}

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                color: 'rgb(185, 28, 28)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: 'var(--brand-primary)' }}
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        <div
          className="mt-6 pt-4 text-center text-xs"
          style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border)' }}
        >
          登录即代表您同意 V1 服务条款(详见 README)
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="flex items-center justify-center min-h-screen">加载中…</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
