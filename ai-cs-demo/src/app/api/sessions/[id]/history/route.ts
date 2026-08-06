import { NextRequest, NextResponse } from 'next/server';
import { getErpAdminClient } from '@/lib/erp-admin-client';

export const runtime = 'nodejs';

/**
 * GET /api/sessions/:id/history — 拉会话所有消息(刷新恢复用)
 *
 * 浏览器代理到 erp-admin internal API,token 在服务端(getErpAdminClient)。
 * 后端 status=2/3 的最后一条 assistant → 在 useChat 客户端转 UIMessage 时会
 * 挂 metadata.isInterrupted=true,UI 出「继续生成」。
 *
 * 设计:不接 POST/PATCH — 所有写操作都在 chat route 内部 server-to-server 完成。
 * Next 16:动态段 params 是 Promise。
 */

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sessionId = parseId(id);
  if (sessionId == null) {
    return NextResponse.json({ error: 'sessionId 非法' }, { status: 400 });
  }
  try {
    const messages = await getErpAdminClient().getSessionMessages(sessionId);
    return NextResponse.json({ messages });
  } catch (e) {
    const raw = (e as Error).message || '拉消息失败';
    console.error('[api/sessions/:id/history] GET failed:', raw);
    // cs-round-016:后端 getMessages 抛 BizCode.NOT_FOUND(1404)时 → 翻 404。
    // 之前任何 BizException 都翻 502,前端 stale URL /chat/<deleted-id> 触发 history 502
    // → 用户侧"接口报错"。会话不存在是用户级语义,不是上游宕机。
    // 识别方式:errp-admin-client 抛出的 message 形如 `erp-admin 业务错误 code=1404: 会话不存在...`
    const isNotFound = /\bcode\s*=\s*1404\b/.test(raw) || /会话不存在|已删除/.test(raw);
    return NextResponse.json(
      { error: raw, code: isNotFound ? 1404 : 'UPSTREAM' },
      { status: isNotFound ? 404 : 502 },
    );
  }
}
