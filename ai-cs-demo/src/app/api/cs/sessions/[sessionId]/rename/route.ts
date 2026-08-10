import { NextResponse } from 'next/server';

/**
 * PATCH /api/cs/sessions/[sessionKey]/rename
 *
 * cs-round-042:浏览器端 renameSessionByKey 走 Next.js BFF(同 close-ticket 模式)
 *   - 浏览器 fetch 相对路径无 CORS
 *   - server-side 转发到 backend 带 X-Internal-Token
 *   - body.title 必填,落 csSession.visitorName(visitorName 复用为 title)
 *
 * 为什么走 BFF:
 *   erp-admin-client.request() 在浏览器端 this.token undefined → 抛 token 错。
 *   改走浏览器相对路径 fetch + Next.js BFF,绕开 CORS 同时不依赖客户端 env。
 *
 * 命名约定(同 close-ticket / open-ticket):
 *   目录名 `[sessionId]` 实际承载 sessionKey(controller param 是 sessionKey)。
 *   历史命名,留 follow-up 统一改名 — 不在本 PR 范围。
 */

const API_BASE =
  process.env.ERP_ADMIN_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

export async function PATCH(
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

  // body title 必填(JSON 解析失败容忍,后端 DTO class-validator 再拒)
  let body: { title?: unknown } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // 空 body 或非法 JSON — 让 backend DTO 返 400
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/internal/cs/sessions/by-key/${encodeURIComponent(sessionKey)}`,
      {
        method: 'PATCH',
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
        message: `BFF rename 代理失败:${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
}