import { NextRequest, NextResponse } from 'next/server'
import { getErpAdminClient } from '@/lib/erp-admin-client'

export const runtime = 'nodejs'

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
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const sessionId = parseId(id)
  if (sessionId == null) {
    return NextResponse.json({ error: 'sessionId 非法' }, { status: 400 })
  }
  try {
    const messages = await getErpAdminClient().getSessionMessages(sessionId)
    return NextResponse.json({ messages })
  } catch (e) {
    console.error('[api/sessions/:id/history] GET failed:', e)
    return NextResponse.json(
      { error: (e as Error).message || '拉消息失败' },
      { status: 502 },
    )
  }
}