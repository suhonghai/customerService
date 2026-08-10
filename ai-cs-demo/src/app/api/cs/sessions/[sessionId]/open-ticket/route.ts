import { NextResponse } from 'next/server';

/**
 * GET /api/cs/sessions/[sessionId]/open-ticket
 *
 * cs-round-038:浏览器 → 本 BFF → backend /api/internal/cs/sessions/:id/open-ticket
 *   解决 erp-admin-client.ts 直接 fetch backend 跨域 CORS 失败 →
 *   RAGChat useEffect 拉 ticket 失败 → banner 不显示的问题。
 *
 * 为什么走 BFF:
 *   - erp-admin-client.ts 用 env.ERP_ADMIN_URL 作为 baseUrl,但 ERP_ADMIN_URL 不是
 *     NEXT_PUBLIC_*,浏览器 process.env.ERP_ADMIN_URL 是 undefined,
 *     fallback 到 'http://127.0.0.1:3001'。浏览器 fetch 跨域 CORS 失败。
 *   - server-side (Next.js route) process.env.ERP_ADMIN_URL 能拿到(SSR 阶段),
 *     可以直接 fetch backend,加上 X-Internal-Token 走 InternalGuard。
 *   - 浏览器 → 自己 Next.js 相对路径,无 CORS 问题。
 *
 * 鉴权:本 BFF 不强制用户登录(cs-round-031 等也都不需要),getSessionOpenTicket
 *   只判断"该 session 是否有 OPEN 工单",不需要 user 身份。InternalGuard 守住
 *   backend 入口,只要 INTERNAL_TOKEN 配上就行。
 */

const API_BASE =
  process.env.ERP_ADMIN_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!INTERNAL_TOKEN) {
    return NextResponse.json(
      { code: 50001, message: 'INTERNAL_TOKEN 未配置' },
      { status: 500 },
    );
  }

  const { sessionId } = await context.params;
  const sessionIdNum = Number(sessionId);
  if (!Number.isInteger(sessionIdNum) || sessionIdNum <= 0) {
    return NextResponse.json(
      { code: 40001, message: 'sessionId 非法' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/internal/cs/sessions/${sessionIdNum}/open-ticket`,
      {
        headers: { 'X-Internal-Token': INTERNAL_TOKEN },
        cache: 'no-store',
      },
    );
    const json = (await res.json()) as {
      code?: number;
      data?: unknown;
      message?: string;
    };
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      {
        code: 30001,
        message: `BFF open-ticket 代理失败:${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
}