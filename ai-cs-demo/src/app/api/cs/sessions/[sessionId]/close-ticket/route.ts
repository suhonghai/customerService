import { NextResponse } from 'next/server';

/**
 * POST /api/cs/sessions/[sessionKey]/close-ticket
 *
 * cs-round-039:浏览器端 closeTicketBySession 走 Next.js BFF(同 open-ticket 模式)
 *   - 浏览器 fetch 相对路径无 CORS
 *   - server-side 转发到 backend 带 X-Internal-Token
 *   - body.reason 可选,落 audit log
 *
 * 为什么走 BFF:
 *   erp-admin-client.request() 在浏览器端 this.token undefined → 抛 token 错。
 *   改走浏览器相对路径 fetch + Next.js BFF,绕开 CORS 同时不依赖客户端 env。
 */

const API_BASE =
  process.env.ERP_ADMIN_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!INTERNAL_TOKEN) {
    return NextResponse.json(
      { code: 50001, message: 'INTERNAL_TOKEN 未配置' },
      { status: 500 },
    );
  }

  const { sessionId: sessionKey } = await context.params;
  if (!sessionKey) {
    return NextResponse.json(
      { code: 40001, message: 'sessionKey 必填' },
      { status: 400 },
    );
  }

  // body reason 可选
  let body: { reason?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // 空 body 或非法 JSON 容忍(后端 reason 字段可空)
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/internal/cs/sessions/${encodeURIComponent(sessionKey)}/close-ticket`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': INTERNAL_TOKEN,
        },
        body: JSON.stringify(body),
        cache: 'no-store',
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      data?: unknown;
      message?: string;
    };
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      {
        code: 30001,
        message: `BFF close-ticket 代理失败:${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
}