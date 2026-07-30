import { NextRequest, NextResponse } from 'next/server';
import { getErpAdminClient } from '@/lib/erp-admin-client';

export const runtime = 'nodejs';

/**
 * POST /api/sessions/upsert — upsert 会话(按 sessionKey 幂等),返回后端数字 id。
 *
 * 用途:页面挂载 / 切换会话时,前端用稳定的 sessionKey(per browser,nanoid)
 * 拿后端 csSession 数字主键 id,以便后续 GET /api/sessions/[id]/history 拉历史。
 *
 * 注:流式消息持久化在 chat route 内部 server-to-server 完成,不经过这个路由。
 * 这个路由只做「frontendId → backendId 映射」,token 仍在服务端。
 */

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      sessionKey?: string;
      visitorId?: string;
      visitorName?: string;
      title?: string;
      channel?: number;
      aiModelCode?: string;
      userId?: number | null; // V1 S5:已登录用户的 userId(透传给后端)
    };
    if (!body.sessionKey || !body.visitorId) {
      return NextResponse.json({ error: 'sessionKey 和 visitorId 必填' }, { status: 400 });
    }
    const session = await getErpAdminClient().upsertSession({
      sessionKey: body.sessionKey,
      visitorId: body.visitorId,
      visitorName: body.visitorName,
      title: body.title,
      channel: body.channel,
      aiModelCode: body.aiModelCode,
      userId: typeof body.userId === 'number' ? body.userId : undefined,
    });
    return NextResponse.json({ id: session.id });
  } catch (e) {
    console.error('[api/sessions/upsert] failed:', e);
    return NextResponse.json({ error: (e as Error).message || 'upsert 失败' }, { status: 502 });
  }
}
