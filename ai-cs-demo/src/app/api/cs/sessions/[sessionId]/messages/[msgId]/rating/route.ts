import { NextResponse } from 'next/server';

/**
 * PATCH /api/cs/sessions/[sessionId]/messages/[msgId]/rating
 *
 * cs-round-043:浏览器端 rateMessage 走 Next.js BFF(同 rename / close-ticket 模式)
 *   - 浏览器 fetch 相对路径无 CORS
 *   - server-side 转发到 backend 带 X-Internal-Token
 *   - body { rating: 1|-1, ratingText?: string } 透传
 *
 * 嵌套目录结构说明:
 *   [sessionId]  = backend csSession.id(整数)
 *   [msgId]      = backend csMessage.id(整数,前端 m.id = String(m.id))
 *   目录名沿用 close-ticket / open-ticket / rename 的 [sessionId] 命名约定
 *   (实际承载 sessionId,语义稍有歧义,留 follow-up 统一改名)
 */

const API_BASE =
  process.env.ERP_ADMIN_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN;

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ sessionId: string; msgId: string }>;
  },
) {
  if (!INTERNAL_TOKEN) {
    return NextResponse.json(
      { code: 50001, message: 'INTERNAL_TOKEN 未配置' },
      { status: 500 },
    );
  }

  const { sessionId, msgId } = await context.params;
  // sessionId / msgId 必须是正整数(防 URL 注入)
  const sessionIdNum = Number(sessionId);
  const msgIdNum = Number(msgId);
  if (
    !Number.isInteger(sessionIdNum) ||
    sessionIdNum <= 0 ||
    !Number.isInteger(msgIdNum) ||
    msgIdNum <= 0
  ) {
    return NextResponse.json(
      { code: 40001, message: 'sessionId / msgId 必须是正整数' },
      { status: 400 },
    );
  }

  // body rating 必填(JSON 解析失败容忍,后端 DTO class-validator 再拒)
  let body: { rating?: unknown; ratingText?: unknown } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // 空 body 或非法 JSON — 让 backend DTO 返 400
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/internal/cs/sessions/${sessionIdNum}/messages/${msgIdNum}/rating`,
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
        message: `BFF rating 代理失败:${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
}