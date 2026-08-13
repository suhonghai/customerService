import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /api/cs/auth/logout
 *
 * [cs-round-049] 浏览器端 logout 走 Next.js BFF,绕开 SameSite=Lax + 跨域
 * 写 Set-Cookie 被拒的问题。
 *
 * 之前:
 *   - 浏览器 (chat.suhhai.cn) 直接 fetch https://api.suhhai.cn/api/cs/auth/logout
 *   - backend 响应 Set-Cookie: cs_access_token=; Domain=.suhhai.cn
 *   - 因为 SameSite=Lax + 跨域 POST,浏览器拒绝写入 Set-Cookie
 *   - 结果:backend 实际清掉了 token,但浏览器还保留老 cookie,me 仍 200
 *     → /login 页面 useEffect 调 me 返回 user → router.replace('/') 跳回首页
 *
 * 现在:
 *   - 浏览器 fetch 相对路径 /api/cs/auth/logout (同源,无 CORS)
 *   - Next.js route 内部 fetch https://api.suhhai.cn/api/cs/auth/logout
 *   - 把 backend 响应 Set-Cookie 透传给浏览器
 *   - 浏览器收到 Set-Cookie (chat.suhhai.cn 同源写入,Lax 允许) → 真正清掉
 *     → 后续 /api/cs/auth/me 返回 null → /login 停留
 */

const API_BASE =
  process.env.ERP_ADMIN_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

export async function POST() {
  // Next.js 15+ cookies() 是 async
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  try {
    const res = await fetch(`${API_BASE}/api/cs/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });

    // 关键:把 backend 响应里的 Set-Cookie 透传给浏览器。
    // NextResponse 用 extra headers 包回去即可,浏览器会按原样写入。
    const setCookie = res.headers.get('set-cookie');
    const next = NextResponse.json(
      { code: 0, data: { success: true } },
      { status: res.ok ? 200 : res.status },
    );
    if (setCookie) {
      // 一个响应可能含多个 Set-Cookie(本场景只有 1 个),NextResponse 支持 append
      next.headers.append('Set-Cookie', setCookie);
    }
    return next;
  } catch (e) {
    return NextResponse.json(
      {
        code: 30001,
        message: `BFF logout 代理失败:${e instanceof Error ? e.message : 'unknown'}`,
      },
      { status: 502 },
    );
  }
}
