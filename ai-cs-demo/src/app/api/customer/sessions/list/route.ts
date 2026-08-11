import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * GET /api/customer/sessions/list
 *
 * 浏览器 → 本 route(Next 自动带浏览器 cookie)
 * 本 route → backend /api/cs/auth/me(用 Cookie 头转发浏览器 cs_access_token cookie)
 *   → 拿到 cs_customer id
 * 本 route → backend /api/internal/cs/sessions?userId=X(带 INTERNAL_TOKEN)
 *   → 拿到该 userId 全部 cs_session
 *
 * 浏览器不需要传任何参数 — 全靠 cookie 自动识别用户。
 *
 * 设计要点:
 * - 浏览器无法直接调 /api/internal/cs/sessions(需要 INTERNAL_TOKEN)
 * - 本 route 是浏览器到 backend 的"代理 + 鉴权翻译层"
 * - 跨浏览器 / 隐身模式 / 清 localStorage 都不影响 — 只要浏览器 cookie 有 cs_access_token 就能拉到
 *
 * 注:customer 端走 cs 鉴权路径 (/api/cs/auth/me,挂 CsJwtAuthGuard,读 cs_access_token cookie)。
 *    之前误写 /api/auth/me(挂 JwtAuthGuard,读 access_token)→ cs_customer 没有 access_token → 401。
 *    [cs-round-044] fix
 */

const API_BASE =
  process.env.ERP_ADMIN_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

export async function GET() {
  if (!INTERNAL_TOKEN) {
    return NextResponse.json({ code: 50001, message: 'INTERNAL_TOKEN 未配置' }, { status: 500 });
  }

  // Next.js 15+ cookies() 是 async,必须 await;getAll() 拿所有 {name,value},拼成 "k=v; k=v"
  // 注意:value 可能是 decoded unicode(v1_user_info 含中文 JSON),Cookie header 必须 ASCII
  // 所以 value 走 encodeURIComponent;原 backend 的 cookie-parser 能正确 decode
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join('; ');

  try {
    // 1) backend /api/cs/auth/me 拿 userId(用 Cookie 头让后端从 cookie 解析 cs_customer JWT)
    const meRes = await fetch(`${API_BASE}/api/cs/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!meRes.ok) {
      return NextResponse.json({ code: 10001, message: '未登录' }, { status: 401 });
    }
    const meJson = (await meRes.json()) as {
      code?: number;
      data?: { id?: number };
    };
    const userId = meJson.data?.id;
    if (!userId) {
      return NextResponse.json({ code: 0, data: { sessions: [] } });
    }

    // 2) backend list(用 userId 过滤)
    const listUrl = new URL(`${API_BASE}/api/internal/cs/sessions`);
    listUrl.searchParams.set('userId', String(userId));
    listUrl.searchParams.set('limit', '50');

    const listRes = await fetch(listUrl.toString(), {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      cache: 'no-store',
    });
    const listJson = (await listRes.json()) as {
      code?: number;
      data?: { sessions?: unknown[] };
      message?: string;
    };
    if (listRes.ok && listJson.code === 0) {
      return NextResponse.json({
        code: 0,
        data: { sessions: listJson.data?.sessions ?? [] },
      });
    }
    return NextResponse.json(
      {
        code: listJson.code ?? 50001,
        message: listJson.message ?? 'list 失败',
      },
      { status: listRes.status },
    );
  } catch (e) {
    return NextResponse.json(
      {
        code: 50001,
        message: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 },
    );
  }
}
