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
    const raw = (e as Error).message || 'upsert 失败';
    console.error('[api/sessions/upsert] failed:', raw);
    // cs-round-019:透传 biz code,区分业务错 vs 真上游宕机。
    // erp-admin-client.ts:138 把后端 code !== 0(BizException,HTTP 200)翻成
    // Error("erp-admin 业务错误 code=50000: 服务器异常")。BFF catch 一律 502
    // 把业务错伪装成上游宕机,用户看不到 code=50000 的具体语义。
    // 修法:从 message 抓 code=NNNN,数字透传;抓不到(真网络错)走 'UPSTREAM' 哨兵。
    const bizMatch = raw.match(/\bcode\s*=\s*(\d+)\b/);
    const bizCode = bizMatch ? Number(bizMatch[1]) : null;
    const isBiz = bizCode !== null;
    return NextResponse.json({ error: raw, code: isBiz ? bizCode : 'UPSTREAM' }, { status: 502 });
  }
}
