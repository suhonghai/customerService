/**
 * DELETE /api/customer/sessions/[sessionKey]
 *
 * 浏览器 → 本 route(Next 自动带浏览器 cookie)
 * 本 route → backend /api/internal/cs/sessions(:id)(带 INTERNAL_TOKEN)
 *
 * 后端 DELETE endpoint 只接受 backend 主键 id,但 ai-cs-demo 只有 sessionKey。
 * 本 route 内部走 erp-admin-client.deleteSessionBySessionKey:
 *   upsert sessionKey 拿 id(幂等,不污染 visitorName) → DELETE by id
 *
 * visitorId 从 query string 拿(client 端用 getVisitorId() 注入),
 * 仅作为 upsert 占位 — 实际命中 update 分支,visitorId / visitorName 不会被改。
 *
 * 鉴权:DELETE 是破坏性操作,生产应校验浏览器 cookie 当前用户的 userId
 * 是否匹配该 sessionKey;本阶段先保留开放(M7 之前 ai-cs-demo 只有本人会话)。
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getErpAdminClient } from '@/lib/erp-admin-client';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ sessionKey: string }> }) {
  try {
    const { sessionKey: rawKey } = await ctx.params;
    const sessionKey = decodeURIComponent(rawKey);
    const url = new URL(_req.url);
    const visitorId = url.searchParams.get('visitorId') ?? 'ai-cs-demo-delete';
    await getErpAdminClient().deleteSessionBySessionKey(sessionKey, visitorId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
