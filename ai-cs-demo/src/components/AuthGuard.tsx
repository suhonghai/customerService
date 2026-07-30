'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { clearAuthCookies, fetchMe, logoutRequest, type AuthUser } from '@/lib/auth';

/**
 * V1 S5 AuthGuard
 *
 * - 挂载时调 /api/cs/auth/me(后端解析 cs_access_token httpOnly cookie)
 *   - 200 + user → 把 user 注入 React Context(简化版:window 全局,留给 chat page 读 id)
 *   - 401 / 失败 → 重定向 /login(带 ?next= 回跳)
 * - 已登录用户访问 /login 时(通过 login 页面自己检查),自动跳回 next 或 /
 *
 * 注:React Context 在 Next.js 13+ App Router 下要包 layout.tsx 不好做,
 * 这里用更轻的 window.__v1_user 兜,避免引入额外 Provider 组件。
 */

const PUBLIC_PATHS = new Set<string>(['/login']);
const INTERNAL_ROLES = new Set(['super_admin', 'agent_lead', 'agent', 'editor', 'viewer']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const me = await fetchMe(apiBase);
      if (cancelled) return;
      if (me) {
        if (me.roles.some((role) => INTERNAL_ROLES.has(role))) {
          clearAuthCookies();
          window.alert('此账号是内部员工账号,请用 9529 顾客账号登录');
          await logoutRequest(apiBase);
          if (cancelled) return;
          router.replace('/login?err=internal');
          return;
        }
        setUser(me);
        // 把 user 挂到 window 兜,page.tsx 的 sendMessage 读 userId 时直接用
        if (typeof window !== 'undefined') {
          (window as unknown as { __v1_user?: AuthUser }).__v1_user = me;
        }
        setReady(true);
      } else {
        // 未登录 → 跳 login
        const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
        router.replace(`/login${next}`);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // 加载中显示空白(避免 SSR hydration mismatch)
  if (!ready) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: 'var(--surface)' }}
      >
        <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
          正在验证登录状态…
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.has(pathname);
}
