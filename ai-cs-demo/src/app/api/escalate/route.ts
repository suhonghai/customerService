/**
 * W9-10 Day 8 (F5):转人工 API
 *
 * 浏览器 POST { reason, urgency?, lastUserMessage? } →
 * 拉起 customer-service MCP client → 调 escalate_to_human 工具 → 返 escalationId
 *
 * 为什么不直接走 AI 聊天气泡(选项 C)?
 *  - MCP server 是子进程,只能在 Node 端调,浏览器调不动 stdio transport
 *  - 走 API route 是天然边界,UI 拿到 escalationId 后自己渲染工单号气泡即可
 *
 * 跟 chat/route.ts 区别:
 *  - chat 是 streamText 走 LLM,这里直接 tool call 无 LLM
 *  - 不需要 listTools 全套,只取 escalate_to_human 一个
 */
import type { ToolSet } from 'ai';
import { createMcpStdioClient } from '@/lib/agent/mcp-client';
import { toUserMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface EscalateRequestBody {
  reason: string;
  urgency?: 'normal' | 'urgent';
  /** 可选:带上前一条用户消息,工单上下文更准(目前 MCP 工具不入参,先透传备查) */
  lastUserMessage?: string;
  /**
   * W9-10 Day 9:前端 activeId 透传 — backend 用这个查 cs_session,
   * 然后 cs_ticket.sessionId 才不是 NULL,运营回复时 reply() bridge
   * 才能写回 cs_message。否则 /api/escalate 这条路径因为不经过
   * chat/route.ts 的 wrappedTools,前端的 sessionKey 永远到不了 MCP 工具。
   */
  sessionKey?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export async function POST(req: Request) {
  let body: EscalateRequestBody;
  try {
    body = (await req.json()) as EscalateRequestBody;
  } catch {
    return Response.json({ ok: false, error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const reason = (body.reason ?? '').trim();
  const urgency = body.urgency === 'urgent' ? 'urgent' : 'normal';

  if (!reason) {
    return Response.json({ ok: false, error: 'reason 不能为空' }, { status: 400 });
  }

  // 拉 MCP client(每请求一个,流结束 close)
  // 单独 try,避免 toUserMessage 抛错时连 escalate 流程都起不来
  let mcp: Awaited<ReturnType<typeof createMcpStdioClient>> | null = null;
  try {
    mcp = await createMcpStdioClient({ abortSignal: req.signal });
    const tools = (await mcp.listTools()) as unknown as ToolSet;
    const escalateTool = tools['escalate_to_human'];
    if (!escalateTool) {
      return Response.json(
        { ok: false, error: 'MCP server 未暴露 escalate_to_human 工具' },
        { status: 500 },
      );
    }

    // 调工具(AI SDK 6.x 的 tool 暴露 execute(input, options))
    // 输入 schema 跟 MCP server 端 zod 一致:{ reason, urgency }
    // 浏览器可控字段都在白名单内,reason 已经过 trim + 非空
    // sessionKey 是后注入:接口定义里只声明 reason / urgency,
    // W9-10 Day 9 加 — backend 用它查 cs_session + dedup ticket。
    const argsWithSession: Record<string, unknown> = { reason, urgency };
    if (body.sessionKey?.trim()) {
      argsWithSession.sessionKey = body.sessionKey.trim();
    }
    const execute = escalateTool.execute as NonNullable<typeof escalateTool.execute>;
    const result: unknown = await execute(argsWithSession, {
      toolCallId: `escalate-${Date.now()}`,
      messages: [],
    });

    // MCP 工具返 isError: true → output 里 content[0].text 是结构化 JSON
    // output-available 走 result.output(content 数组) / 旧 SDK 返 result 直接
    const resultRecord = asRecord(result);
    const output = resultRecord?.output ?? result;
    const outputRecord = asRecord(output);
    const content = Array.isArray(outputRecord?.content) ? outputRecord.content : [];
    const text =
      typeof asRecord(content[0])?.text === 'string' ? (asRecord(content[0])?.text as string) : '';
    let parsed: unknown = null;
    if (typeof text === 'string' && text) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        /* 非 JSON,保持 null */
      }
    }
    const parsedRecord = asRecord(parsed);

    // isError 信号在 output.isError 或 result.isError(SDK 版本差异)
    const isError = outputRecord?.isError === true || resultRecord?.isError === true;

    if (isError || parsedRecord?.error) {
      const errMsg =
        typeof parsedRecord?.message === 'string'
          ? parsedRecord.message
          : typeof text === 'string'
            ? text
            : '转人工失败,稍后再试';
      // 走 toUserMessage 统一错误分类(可能命中 MCP 工具错的 6.3 类)
      return Response.json(
        {
          ok: false,
          error: errMsg,
          userError: toUserMessage(new Error(errMsg)),
        },
        { status: 200 }, // 业务错仍 200,把 userError 给前端处理
      );
    }

    // 成功:从 parsed 拿 escalationId / wait minutes
    const escalationId =
      typeof parsedRecord?.escalationId === 'string' ? parsedRecord.escalationId : '';
    const estimatedWaitMinutes =
      typeof parsedRecord?.estimatedWaitMinutes === 'number'
        ? parsedRecord.estimatedWaitMinutes
        : 15;
    if (!escalationId) {
      return Response.json({ ok: false, error: 'MCP 工具未返回 escalationId' }, { status: 500 });
    }

    return Response.json({
      ok: true,
      escalationId,
      estimatedWaitMinutes,
      urgency: typeof parsedRecord?.urgency === 'string' ? parsedRecord.urgency : urgency,
      warning: parsedRecord?.warning ?? null,
    });
  } catch (err: unknown) {
    console.error('[escalate] failed:', err);
    // err 可能是 UserFacingError(由 createMcpStdioClient 包过),直接透传
    const userErr = err && typeof err === 'object' && 'title' in err ? err : toUserMessage(err);
    return Response.json({ ok: false, userError: userErr }, { status: 200 });
  } finally {
    if (mcp) {
      await mcp.close().catch((err) => console.error('[escalate] mcp close failed:', err));
    }
  }
}
