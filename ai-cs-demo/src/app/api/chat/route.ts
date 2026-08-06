import type { ToolExecutionOptions, ToolSet } from 'ai';
import {
  streamText,
  convertToModelMessages,
  UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from 'ai';
import { qwenChat, initAiFromErpAdmin } from '@/lib/ai';
import { peekCachedAiConfig } from '@/lib/ai-config';
import { search } from '@/lib/rag';
import { createMcpStdioClient } from '@/lib/agent/mcp-client';
import { getErpAdminClient } from '@/lib/erp-admin-client';

/**
 * cs-round-011:流式回复抗中断 — 后端生成任务和 SSE 连接解耦 +
 * continueFromMessageId 续推接口 + withStreamRetry 临时抖动重试。
 *
 * 关键约束(W11 + cs-round-011):
 *  1. streamText **不**绑 req.signal — client 断开后服务端继续生成,
 *     onFinish / onError 仍会落库 status=1 或 status=4。
 *     这意味着 generationPromise 在 SSE controller 关闭后仍能跑完。
 *  2. continueFromMessageId 路径:跳过创建新 placeholder,直接把流 append 到
 *     已有 status=2/4 的 message 上;服务端 accumulatedText 从 existing.content
 *     开始累积(不是从零)。前端 useChat 通过 stream chunks 拿到 delta 后
 *     setMessages 把新的 text append 到 id=continueFromMessageId 的 message 上。
 *  3. withStreamRetry 处理 streamText 全程抛错的临时场景(网络闪断 / 5xx /
 *     transient timeout),最多重试 2 次(无感),持续失败转 onError 标 status=4。
 */

// 续推请求的 body 字段类型(cs-round-011)
interface ChatBodyExtend {
  message?: string;
  messages?: UIMessage[];
  sessionId?: string;
  sessionKey?: string;
  visitorId?: string;
  userId?: number | null;
  customerId?: number | null;
  topK?: number;
  /** cs-round-011:续推起点。提供时跳过创建 placeholder,改成 PATCH 这条已有 message */
  continueFromMessageId?: number;
}

/**
 * withStreamRetry:把 streamText 全程跑完的过程包一层重试。
 * - 区分 transient(可重试)vs permanent(立即抛)
 * - transient 错误:网络层 / AI 5xx / 模型超时(超 5xx/timeout 关键字)
 * - permanent:401 / 400 / invalid 配置
 * - 重试 2 次(200ms → 800ms 退避),全失败抛回上层
 *
 * 注:streamText 返回 result 对象,这里用「重跑整个 streamText」方式实现 —
 * 每个 attempt 内部都重新发起 streamText,完全独立的连接 + 累积 + PATCH。
 * 简单清晰,plain async 实现,**不引第三方 lib**(brief 红线)。
 */
async function withStreamRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; onAttempt?: (n: number) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const delays = [200, 800]; // 退避序列
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    opts.onAttempt?.(attempt);
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const retryable = isTransientStreamError(e);
      const hasMore = attempt < retries;
      if (!retryable || !hasMore) throw e;
      const ms = delays[attempt] ?? 800;
      console.warn(
        `[chat] transient stream error (attempt ${attempt + 1}/${retries + 1}),retry in ${ms}ms:`,
        (e as Error)?.message ?? String(e),
      );
      await new Promise<void>((r) => setTimeout(r, ms));
    }
  }
  throw lastErr;
}

/**
 * 判断错误是否「可重试」(transient)。
 * - 401 / 403 / 400 / NOT_FOUND / missing key → permanent,立即失败
 * - 5xx / ECONNRESET / ETIMEDOUT / network / timeout → transient,可重试
 */
function isTransientStreamError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (!msg) return true; // 空 message = 网络层截断,默认可重试
  // permanent 优先判定
  if (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('400') ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('bad request') ||
    msg.includes('invalid api key') ||
    msg.includes('no active ai config')
  ) {
    return false;
  }
  // transient 关键字
  return (
    msg.includes('5') || // 5xx 通用
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('upstream') ||
    msg.includes('fetch failed')
  );
}

export const runtime = 'nodejs';
export const maxDuration = 60; // 升级:Agent 可能多步,给足时间

interface TextPart {
  type: string;
  text?: string;
}

/**
 * cs-round-022:判定一条 user message 是否「内容实质为空」。
 *
 * 触发场景:useAutoResumeStreaming.resumeOne(见
 * src/hooks/use-auto-resume-streaming.ts)在 status=2 续推时,会 POST
 * /api/chat body 塞一条合成 user:
 *   { id: 'm_continue_<id>', role: 'user', parts: [{ type: 'text', text: '' }] }
 * 这条不是真用户提问 —— 是触发服务端继续生成 assistant 流的「空消息 trigger」,
 * 不能污染会话历史,否则 DB 多一条空 user row(UI 显示一个空 user bubble)。
 *
 * 判定逻辑(边界 case 要小心):
 *  1. parts=[] 且 queryText 空 → 真合成空消息 → true
 *  2. parts 全是空 text part + queryText 空/whitespace-only → true
 *  3. 至少一个非 text 类型 part(如 tool-call / file / image)→ 不算空,保留
 *  4. queryText 非空白 → 真用户提问 → false
 *
 * 注:此函数是 pure,不做防御性 throw;BFF 入口已经保证 messages/parts 形状合法。
 */
export function isEffectivelyEmptyUserMessage(queryText: string, parts: unknown[]): boolean {
  if (!Array.isArray(parts)) return queryText.trim().length === 0;
  // 1. 完全空 parts + 空 content
  if (parts.length === 0 && queryText.length === 0) return true;
  // 2. parts 全是空 text + content 空/whitespace-only
  if (
    parts.length > 0 &&
    queryText.trim().length === 0 &&
    parts.every(
      (p: unknown) =>
        typeof p === 'object' &&
        p !== null &&
        (p as { type?: unknown }).type === 'text' &&
        (typeof (p as { text?: unknown }).text !== 'string' ||
          ((p as { text?: string }).text as string).length === 0),
    )
  ) {
    return true;
  }
  // 3/4. 非空(text 或带 tool/image part)→ 不算空
  return false;
}

/**
 * W9-10 Day 6 (F3b):客服对话路由 —— RAG + MCP 4 工具 + 服务端持久化
 *
 * 设计(沿用 W5-6 的 Agent 模式 + 客服场景改造):
 *  1. 同步阶段调 search(query, topK) → 拼 system prompt 注入 [1][2][3] 资料(给 AI 起点)
 *  2. 同步阶段起 MCP client(stdio 拉起 customer-service.ts)→ listTools() 拿 4 工具
 *  3. streamText 4 参数:
 *     - tools: MCP 4 工具(search_faq / get_user_order / create_ticket / escalate_to_human)
 *     - stopWhen: stepCountIs(5):多步推理(AI 可「思考→调工具→看结果→再思考」)
 *  4. 流末尾发 2 个 message-metadata:retrieval(检索详情) + tools(工具列表)
 *  5. onStepFinish 打日志,审计工具调用
 *  6. MCP client 在 stream finally 关闭(子进程释放)
 *
 * W9-10 Day 10+ 重构:服务端持久化(streaming 期间每 500ms 节流 PATCH,流结束 status=1 done)。
 *  - 前端不再做 upsert / append / update,只用 useChat 默认 transport
 *  - tab 关后端继续写,刷新从 GET /api/sessions/[id]/history 拉回
 *
 * RAG vs MCP search_faq 分工:
 *  - RAG 是被动注入(system 里直接塞 [1][2][3],首步就用)
 *  - MCP search_faq 是主动调用(AI 判断资料不够才调,topK 1-10)
 *  - 功能重叠但用法互补
 *
 * 范围红线(W9-10 阶段内):
 *  - 只做 MCP 工具集成;不动前端 UI(Day 7 才动决策过程面板 / 错误兜底)
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ChatBodyExtend;
    const topK = body.topK ?? 3;

    // cs-round-011:continueFromMessageId 续推初始化变量(在 session setup 块里赋值,
    // 后面的流式 PATCH 阶段读 → 必须先声明,temporal dead zone)。
    let continueFromInitialText = '';
    let continueFromInitialParts: unknown[] = [];
    let continueFromStatus = 0;

    // 兼容两种 payload shape:
    //  1) { messages: UIMessage[] } — AI SDK 6.x 客户端(多轮历史)
    //  2) { message: string }        — 早期 / 自定义客户端(单条)
    // 两种都缺 → 400,不再 500
    let messages: UIMessage[];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
    } else if (typeof body.message === 'string' && body.message.trim().length > 0) {
      messages = [
        {
          id: `m_${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', text: body.message }],
        } as unknown as UIMessage,
      ];
    } else {
      return new Response(
        JSON.stringify({ error: 'payload must include `message` (string) or `messages` (array)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 拿最后一条用户消息作为查询(防御:加 ?? [])
    const lastUserMessage = [...messages].reverse().find((m) => m && m.role === 'user');
    const queryText =
      (lastUserMessage?.parts ?? [])
        .filter((p: TextPart) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p: TextPart) => p.text)
        .join('') || '';

    // ============= 同步阶段 0:服务端持久化准备(upsertSession + append user + assistant placeholder) =============
    // sessionKey 没传 → 用最后一条 user 消息 id 作 fallback(每次都新 session,不理想但能跑)
    // visitorId 必传(前端用 localStorage 保证稳定,server-side fallback 用 "server-anon-<random>")
    const sessionKey =
      body.sessionKey?.trim() || `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const visitorId = body.visitorId?.trim() || `srv-${sessionKey.slice(0, 12)}`;

    const erp = getErpAdminClient();
    let sessionId: number;
    let assistantMsgId: number = -1;
    try {
      // V1 S5:已登录时把 userId 透传到 upsertSession,后端落到 cs_session.userId
      // 未登录(V1.0 admin 演示)留 null,cs_session.userId 仍为 NULL
      const session = await erp.upsertSession({
        sessionKey,
        visitorId,
        userId: typeof body.userId === 'number' ? body.userId : undefined,
        // W11:C 端登录时把 customerId 单独透传,后端写到 cs_session.customerId;
        // listOrdersBySession 看到这个非空就走 Order.customer_id 过滤(避开 CsCustomer.id
        // 撞 User.id 命名空间的 bug)
        customerId: typeof body.customerId === 'number' ? body.customerId : undefined,
      });
      sessionId = session.id;

      // 落 user message(只在「最后一条 user 是新的、没在 messages 里出现过 user role 时」才 append?
      // 这里简化:每次都 append — 如果前端发了历史 messages,后端会按 id ASC 一致累加。
      // 如果用户重复发同一条(刷新场景下 click send),会重复 — 但 sendMessage 是创建新 UIMessage,
      // 不会重复,安全。
      // cs-round-022:useAutoResumeStreaming 续推时会 POST 一条合成空 user
      // (parts=[{type:'text', text:''}],content=''),这条不是真用户提问,
      // 跳过 appendMessage,避免 cs_message 多一条 status=1 content='' 的污染 row。
      // 注:messages / lastUserMessage / streamText 上下文都不动 —— streamText
      // 仍能从 body.messages 拿到那条合成 user,正常开始生成 assistant 流。
      const lastParts = (lastUserMessage as unknown as { parts?: TextPart[] })?.parts ?? [];
      if (isEffectivelyEmptyUserMessage(queryText, lastParts as unknown[])) {
        console.warn(
          `[chat] skip empty user appendMessage sessionId=${sessionId} (useAutoResumeStreaming 续推 trigger,非真用户提问) id=${String(lastUserMessage?.id ?? '')}`,
        );
      } else {
        await erp.appendMessage(sessionId, {
          role: 'user',
          content: queryText,
          parts: lastParts,
          status: 1,
        });
      }

      // ============= W11 C3 (shared thread):转人工检测 — AI 闭嘴(必须在 placeholder 之前) =============
      //   业务:session 已 open 工单(已转人工)→ 客户发的后续消息不再调 LLM,
      //   直接通过 appendMessage(user) 走 backend 的 user_message WS emit,
      //   erp-admin ConversationPanel 实时看到,真人回复走 operator_reply。
      //   行为:不调 streamText、不调 RAG、不起 MCP client(省 token + 时间)。
      //   前端:仍走 createUIMessageStream 返一条合成 assistant "运营正在处理您的消息,请稍候。"
      //   — useChat 默认 transport 完全兼容,前端无需改。
      //
      //   关键:ack 路径必须 **不** 创建 assistant placeholder(空 status=2 行) —
      //   否则 cs_message 留下 status=2 content='' 死行,history refetch 时 m.parts 无 text
      //   → text 空 → page.tsx line 1244 的 !text 重试兜底误触发。
      //   真人回复走 operator_reply(已有 bridge + WS emit),不需要 placeholder 占位。
      if (sessionId > 0) {
        try {
          const openTicket = await erp.getSessionOpenTicket(sessionId);
          if (openTicket && (openTicket as unknown as { ticketNo?: string }).ticketNo) {
            const ackText = '运营正在处理您的消息,请稍候。';
            console.log(
              `[chat] in-human-handoff sessionId=${sessionId} ticketNo=${openTicket.ticketNo} → AI 闭嘴`,
            );
            // cs-round-003:handoff ack 落库,刷新页面也能看到
            // 用真实 messageId(从 appendMessage 返回),前端 useChat 收到的 messageId 就对得上
            let ackMessageId = `ack-${Date.now()}`;
            try {
              const ackRow = await erp.appendMessage(sessionId, {
                role: 'assistant',
                content: ackText,
                status: 1, // 直接落库正常状态(不是 2 streaming)
                metadata: {
                  source: 'system-ack',
                  reason: 'human-handoff',
                  ticketNo: (openTicket as unknown as { ticketNo: string }).ticketNo,
                },
              });
              ackMessageId = `srv-${ackRow.id}`;
            } catch (e) {
              // best-effort:appendMessage 失败不应阻断 ack 合成给前端
              console.warn('[chat] handoff ack 落库失败,fallback 内存 messageId:', (e as Error).message);
            }
            const ackStream = createUIMessageStream({
              originalMessages: messages,
              execute: async ({ writer }) => {
                writer.write({ type: 'start', messageId: ackMessageId });
                // AI SDK 6.x:text-start/text-delta/text-end 的标识字段是 `id`,不是 `messageId`
                writer.write({ type: 'text-start', id: ackMessageId });
                writer.write({ type: 'text-delta', id: ackMessageId, delta: ackText });
                writer.write({ type: 'text-end', id: ackMessageId });
                writer.write({ type: 'finish' });
              },
            });
            return createUIMessageStreamResponse({ stream: ackStream });
          }
        } catch (e) {
          // best-effort:handoff 检测失败不能让 AI 答不上(best-effort 网络探测),fall through 走 LLM
          console.warn('[chat] open-ticket probe failed:', (e as Error).message);
        }
      }

      // cs-round-011:continueFromMessageId 路径 — 跳过创建 placeholder,
      // 直接把流 append 到已有 status=2/4 的 message 上(用户刷新页面或点重试时,
      // 服务端续推同一条 message,前端 setMessages 按 id merge)。
      //
      // 校验:必须是 assistant role,且 status ∈ {2 streaming, 4 error} —
      // status=1 已完成 / status=3 已中断(history → regenerate 时才续推,但
      // 那条路径走 status=2 经 refresh)。其他值 400 拒绝。
      if (typeof body.continueFromMessageId === 'number' && body.continueFromMessageId > 0) {
        try {
          const existing = await erp.getMessage(sessionId, body.continueFromMessageId);
          if (!existing) {
            return new Response(
              JSON.stringify({ error: 'continueFromMessageId 不存在该会话' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
          }
          if (existing.role !== 'assistant') {
            return new Response(
              JSON.stringify({ error: 'continueFromMessageId 必须指向 assistant role' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
          }
          if (existing.status !== 2 && existing.status !== 4) {
            return new Response(
              JSON.stringify({
                error: `continueFromMessageId 当前 status=${existing.status},仅允许续推 2(streaming)/4(error)`,
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
          }
          assistantMsgId = existing.id;
          // 初始化累积变量为已有 partial content/parts — LLM 接着写不是从零开始
          continueFromInitialText = existing.content || '';
          continueFromInitialParts = Array.isArray(existing.parts) ? existing.parts : [];
          continueFromStatus = existing.status;
          console.log(
            `[chat] continueFromMessageId=${assistantMsgId} status=${existing.status} contentLen=${(existing.content || '').length} → 续推`,
          );
        } catch (e) {
          console.error(
            '[chat] continueFromMessageId lookup failed:',
            (e as Error).message,
          );
          return new Response(
            JSON.stringify({ error: 'continueFromMessageId lookup failed' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
      } else {
        // 创建 assistant placeholder(空内容,status=2 streaming)
        // 流式期间节流 PATCH 这个 id,流结束 PATCH status=1 done。
        // 兜底:如果 placeholder 创建失败,记 -1,后续 PATCH 跳过(不影响流给浏览器)。
        //
        // 注意:必须在 handoff 检测之后 —— ack 路径已经 return,不会走到这里。
        try {
          const placeholder = await erp.appendMessage(sessionId, {
            role: 'assistant',
            content: '',
            parts: [],
            status: 2,
          });
          assistantMsgId = placeholder.id;
        } catch (e) {
          console.warn('[chat] assistant placeholder create failed:', (e as Error).message);
          assistantMsgId = -1;
        }
      }
    } catch (e) {
      console.error('[chat] session setup failed:', e);
      // 持久化准备失败:不让流终止(本地内存还兜底),只 warn
      sessionId = -1;
    }

    // ============= 同步阶段 1:FAQ RAG 检索(给 AI 起点) =============
    const k = Math.max(1, Math.min(10, topK));
    let topResults: Awaited<ReturnType<typeof search>> = [];
    let retrievalError: string | null = null;
    try {
      topResults = await search(queryText, k);
    } catch (err) {
      console.error('[chat] FAQ retrieval failed:', err);
      retrievalError = err instanceof Error ? err.message : String(err);
    }

    const contextBlock =
      topResults.length > 0
        ? topResults
            .map(
              (item, i) =>
                `[${i + 1}] (来源:${item.chunk.source},第 ${item.chunk.index + 1} 块,相似度 ${item.score.toFixed(3)})\n${item.chunk.text}`,
            )
            .join('\n\n---\n\n')
        : '（知识库里没找到相关内容,基于一般知识回答即可;若用户问的是 FAQ 范围但答不上,礼貌说明并建议转人工）';

    // ============= 同步阶段 2:MCP Client 起,listTools 拿 4 工具 =============
    // 必须同步阶段连(AI SDK 6.x 拿到的是闭包,不能延后 connect)
    //
    // W11 改动:先确保 ai-config 已 init(chat 路径用 active 配置的 baseUrl/apiKey/model,
    //   而不是 process.env 中的 DASHSCOPE_API_KEY 这种 fallback),
    //   并把 active cfg 注入 MCP 子进程 env,让它内部 src/lib/rag.ts 调 embedding 时
    //   也能用真 apiKey。
    //
    // 注意:不要用 `if (!peekCachedAiConfig()) await initAiFromErpAdmin()`
    //   这种条件调用 —— initAiFromErpAdmin 内部有 _initialized 锁,
    //   万一先前某次初始化失败(fallback-missing-key),后续 peek 即使为空也不会重试,
    //   会一直 Unauthorized。强制每次都跑 init(force=true + 1h cache),
    //   确保 chat 路径始终用真凭证。
    await initAiFromErpAdmin();
    const activeCfg = peekCachedAiConfig();
    if (!activeCfg || !activeCfg.apiKey) {
      // 真·降级也没救的场景:erp-admin 不可达且 env 没 key → 直接 503,
      // 比让 LLM 401 Unauthorized 更直观(排查时一眼能看出是凭证缺失)
      console.error('[chat] active ai-config 缺失(erp-admin 不可达且无 env key)');
      return new Response(
        JSON.stringify({
          error: 'AI_CONFIG_UNAVAILABLE',
          message: 'active ai-config 不可用:erp-admin 不可达且 env.DASHSCOPE_API_KEY 未配置',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    console.log(
      `[chat] active ai-config: modelId=${activeCfg.modelId} provider=${activeCfg.provider}`,
    );
    const mcp = await createMcpStdioClient({ abortSignal: req.signal, cfg: activeCfg });
    const mcpTools = (await mcp.listTools()) as unknown as ToolSet;
    const toolList = Object.keys(mcpTools);
    console.log(`[chat] MCP tools: ${toolList.join(', ')}`);

    // ============= System Prompt(客服专用,覆盖 Day 4 通用 RAG) =============
    const system = `你是「小服」,一名专业的 AI 智能客服助手,服务于一家电商 SaaS 公司。
你做事靠谱、语气亲切、不啰嗦。

## 你能调用的工具
1. **get_active_orders**(userId?) — 拉当前用户所有进行中的订单(L3 实时上下文,不需要订单号)
2. **get_user_order**(orderId) — 查指定订单详情(状态、金额、物流单号、出货时间)
3. **search_faq**(query, topK?) — 从 FAQ 知识库二次检索(资料没覆盖时再用)
4. **create_ticket**(userIssue, priority?, relatedOrderId?) — 创建工单留底(给运营跟进)
5. **escalate_to_human**(reason, urgency?) — 转人工客服(用户明确要人或实在解决不了时)

## 工具使用决策
- 用户问「我最近一单 / 我有哪些订单 / 我的订单状态」(没给订单号)→ **优先调 get_active_orders** 拉 L3 上下文
- 用户给了具体订单号(订单 #xxx)→ **必须先调 get_user_order** 查该订单详情
- 用户问通用问题(怎么退款/怎么开发票/怎么投诉)→ 优先用【参考资料】;**资料没覆盖才调 search_faq** 二次检索
- 用户明确要「转人工」/「找真人」/ 反复说「你解决不了」→ 调 escalate_to_human
- 用户问题复杂(订单异常 + 投诉态度 + 申请赔偿)→ 调 create_ticket 留底
- 工具返回 { error, message } → 友好告知用户(如「抱歉没找到订单 #999」),不要把 error 结构当数据用

## 引用规则
- 引用【参考资料】时用 [1] [2] [3] 标(沿用知识库引用风格)
- 引用工具结果时用「根据订单信息...」「您的订单...」自然引用,**不用 [n]**
- 没引用就不要标,标了反而显得不诚实

## 边界
- 资料和工具都查不到 → 明确说「目前资料库没收录这个问题,我会记录下来让运营补充」,**绝不瞎编**
- 用户问敏感信息(密码 / 身份证 / 银行卡)→ 拒绝并建议走安全渠道
- 用户投诉 / 情绪激动 → 先共情再给方案,避免冷冰冰官腔
- 问医疗 / 法律等专业话题 → 礼貌说明超出 AI 客服范围,建议转人工

## 风格
- 短句,不要长段落;关键信息(订单号 / 物流单号 / 时间)单独成行
- 不要复述资料原文,用自己的话总结
- 回答末尾可列「参考来源」清单(仅当用了 [n] 引用时)

【参考资料】
${contextBlock}`;

    const retrievalMeta = {
      query: queryText,
      topK: k,
      results: topResults.map((r, i) => ({
        ref: `[${i + 1}]`,
        source: r.chunk.source,
        index: r.chunk.index,
        score: Number(r.score.toFixed(4)),
        preview: r.chunk.text.slice(0, 120) + (r.chunk.text.length > 120 ? '...' : ''),
        text: r.chunk.text,
      })),
      error: retrievalError,
    };

    const toolsMeta = {
      list: toolList,
      count: toolList.length,
    };

    // cs-round-011:continueFromMessageId 续推初始化变量在函数顶部已声明,
    // 上面 continueFromMessageId 路径已写入。下面直接读。

    // ============= 流式期间累积 + 节流 PATCH(服务端持久化核心) =============
    // 累积所有 text-delta,每 500ms PATCH 一次(status=2 streaming)。
    // 流结束 / abort → 取消 timer,最终 PATCH(status=1 normal 或 status=3 interrupted)。
    // 注意:onChunk callback 是 blocking(SDK 等 promise resolve 才继续),所以 PATCH
    //   调 fire-and-forget,不 await — 避免拖慢流。
    // cs-round-011:continueFromMessageId 时,初始化为已有 partial content + parts。
    let accumulatedText = continueFromInitialText;
    let accumulatedReasoning = ''; // 独立于 accumulatedText,reasoning 走自己字段
    // cs-round-011:continueFromMessageId 时,把已有 parts 直接搬过来当起点(避免重复 tool-call / 已完成推理被覆盖)
    const accumulatedParts: Array<Record<string, unknown>> = [
      ...(continueFromInitialParts as Array<Record<string, unknown>>),
    ];
    let accumulatedTextPart: { type: 'text'; text: string } | null = null;
    const accumulatedMetadata: {
      toolCalls?: Array<Record<string, unknown>>;
      toolCallCount?: number;
      lastStep?: number;
      abortedAt?: string;
      errorAt?: string;
      errorMessage?: string;
    } = {};
    let lastChunkType = '';
    let chunkCount = 0;
    let patchTimer: NodeJS.Timeout | null = null;
    let lastPatchInFlight: Promise<void> = Promise.resolve();

    const flushPatch = (status: number) => {
      if (sessionId <= 0 || assistantMsgId <= 0) return;
      const payload = {
        content: accumulatedText,
        parts: accumulatedParts,
        status,
        metadata: {
          ...accumulatedMetadata,
          lastChunkType,
          lastStep: accumulatedMetadata.lastStep,
          chunkCount,
          reasoningLength: accumulatedReasoning.length,
        },
      };
      lastPatchInFlight = lastPatchInFlight.then(async () => {
        try {
          await erp.updateMessage(sessionId, assistantMsgId, payload);
        } catch (e) {
          console.warn('[chat] PATCH failed:', (e as Error).message);
        }
      });
    };

    const schedulePatch = () => {
      if (patchTimer) return;
      patchTimer = setTimeout(() => {
        patchTimer = null;
        flushPatch(2);
      }, 500);
    };

    // ============= Agent 核心:streamText + MCP tools + stepCountIs =============
    // Wrap escalate_to_human:LLM 只看到 reason/urgency(都是它能填的),
    //   sessionKey 由前端在 execute 时自动注入(运行时变量,LLM 看不到)。
    //   解决 e2af278 留下的 -32602 input validation 'sessionKey received undefined'。
    // W11 C-FULL:sessionKey 由服务端注入,LLM 看不到 userId
    const getActiveOrdersExecute = mcpTools.get_active_orders.execute as NonNullable<
      typeof mcpTools.get_active_orders.execute
    >;
    // Wrap escalate_to_human:LLM 只看到 reason/urgency(都是它能填的),
    //   sessionKey 由前端在 execute 时自动注入(运行时变量,LLM 看不到)。
    //   解决 e2af278 留下的 -32602 input validation 'sessionKey received undefined'。
    const escalateExecute = mcpTools.escalate_to_human.execute as NonNullable<
      typeof mcpTools.escalate_to_human.execute
    >;
    const wrappedTools = {
      ...mcpTools,
      get_active_orders: {
        ...mcpTools.get_active_orders,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          // 防御性:即使 LLM 试图传 userId,这里剥掉 + warn
          const { userId: _ignoredUserId, ...safeArgs } = args as { userId?: unknown };
          if (_ignoredUserId !== undefined) {
            console.warn(
              `[chat] get_active_orders: LLM 尝试传入 userId=${String(_ignoredUserId)},已丢弃`,
            );
          }
          return getActiveOrdersExecute({ ...safeArgs, sessionKey }, options);
        },
      },
      escalate_to_human: {
        ...mcpTools.escalate_to_human,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          return escalateExecute({ ...args, sessionKey }, options);
        },
      },
    };

    // W11 sanitize:任何上游(前端 history restore / regen / 未来新 transport)发来的
    // tool-like part 如果有 output 但缺 state/providerExecuted,后端兜底补全,
    // 否则 AI SDK 6.x convertToModelMessages 看到「孤儿 tool-call」→ AI_MissingToolResultsError
    // → AI_NoOutputGeneratedError。主修在 storedToUIMessage(message-converter.ts),这里是 belt。
    const sanitizedMessages = messages.map((m) => {
      if (m.role !== 'assistant') return m;
      return {
        ...m,
        parts: m.parts.map((p) => {
          const t = (p as { type?: string }).type;
          const isTool = typeof t === 'string' && (t.startsWith('tool-') || t === 'dynamic-tool');
          if (!isTool) return p;
          const partAny = p as { state?: string; output?: unknown };
          if (partAny.state !== undefined) return p;
          if (partAny.output == null) return p; // 没 output = 真·未完成,不冒充
          return { ...p, state: 'output-available', providerExecuted: true };
        }),
      };
    });

    // cs-round-011:streamText 包一层 withStreamRetry — 临时抖动(网络闪断 / 5xx /
    //   transient timeout)自动重试 2 次,持续失败转 onError 标 status=4。
    //   onChunk/onFinish 闭包里有累积变量,每个 attempt 必须重新 fresh,
    //   否则重试会把第一次的 accumulatedText double-write。
    const buildStream = async () => streamText({
      model: qwenChat,
      // AI SDK 6.x convertToModelMessages 入参是 Omit<UIMessage, "id">[]。
      // sanitizedMessages 是从 UIMessage[] map 出来的,需要手动 narrow 类型。
      // 用类型断言而不是逐字段剥离,避免 spread 后类型推断退化。
      messages: await convertToModelMessages(
        sanitizedMessages as unknown as Parameters<typeof convertToModelMessages>[0],
      ),
      system,
      tools: wrappedTools, // MCP 4 工具,escalate_to_human 已 wrap(自动注入 sessionKey)
      stopWhen: stepCountIs(5), // 最多 5 步
      // W11:不绑 req.signal — 关 tab / 断网 时 client disconnect 不该让 server 放弃
      // 已经跑出的 LLM 答案。让 streamText 自然跑完,onFinish 触发 PATCH status=1,
      // 下次进 session 直接看到完整内容,而不是「继续生成」按钮。
      // cs-round-011:这同时也是 generationPromise 与 SSE 解耦的基础:
      //   即便 SSE controller 关闭了,generationPromise 仍能跑完。
      // Trade-off:UI 「停止」按钮只能停前端 streaming;server 仍跑完(LLM token 省不下)。
      // 真正 abort 需要单独端点 + redis 标记,session scope 太重,本阶段不做。
      onChunk: ({ chunk }) => {
        const streamChunk = chunk as unknown as {
          type: string;
          toolName?: string;
          text?: string;
          [key: string]: unknown;
        };
        lastChunkType = streamChunk.type;
        chunkCount += 1;

        // text-delta:累积 text(text-start/text-end 不累积)
        if (streamChunk.type === 'text-delta' && typeof streamChunk.text === 'string') {
          accumulatedText += streamChunk.text;
          if (accumulatedTextPart) {
            accumulatedTextPart.text = accumulatedText;
          } else {
            accumulatedTextPart = { type: 'text', text: accumulatedText };
            accumulatedParts.push(accumulatedTextPart);
          }
          schedulePatch();
        } else if (streamChunk.type === 'tool-input-end' || streamChunk.type === 'tool-result') {
          const toolPart = { ...streamChunk, type: `tool-${streamChunk.toolName}` };
          accumulatedParts.push(toolPart);
          accumulatedMetadata.toolCalls ??= [];
          accumulatedMetadata.toolCalls.push(toolPart);
          schedulePatch();
        } else if (streamChunk.type === 'reasoning-delta' || streamChunk.type === 'reasoning-end') {
          const t = streamChunk.text || '';
          accumulatedReasoning += t;
          // 找/建单个 reasoning part,避免数组膨胀
          const existing = accumulatedParts.find((p) => p.type === 'reasoning');
          if (existing) {
            existing.text = (existing.text as string | undefined) ?? '';
            (existing.text as string) += t;
          } else {
            accumulatedParts.push({ type: 'reasoning', text: t });
          }
          schedulePatch();
        }
      },
      onStepFinish: ({ stepNumber, toolCalls, toolResults, usage }) => {
        accumulatedMetadata.lastStep = stepNumber;
        accumulatedMetadata.toolCallCount =
          (accumulatedMetadata.toolCallCount || 0) + toolCalls.length;
        if (toolCalls && toolCalls.length > 0) {
          console.log(
            `[agent] step ${stepNumber ?? '?'}: ${toolCalls.length} tool call(s):`,
            toolCalls.map((c) => c.toolName),
          );
        }
        if (toolResults && toolResults.length > 0) {
          for (const r of toolResults) {
            const out = (r as unknown as { output?: unknown }).output;
            const preview =
              typeof out === 'string' ? out.slice(0, 100) : JSON.stringify(out).slice(0, 100);
            console.log(
              `[agent] tool ${(r as unknown as { toolName?: string }).toolName} → ${preview}...`,
            );
          }
        }
        if (usage) {
          console.log(
            `[agent] step usage: in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.totalTokens}`,
          );
        }
      },
      onFinish: async () => {
        // 流正常结束:取消节流 timer,最终 PATCH status=1 normal
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
        flushPatch(1);
      },
      onAbort: async () => {
        // 用户中断:同上,但 status=3 interrupted
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
        accumulatedMetadata.abortedAt = new Date().toISOString();
        flushPatch(3);
        await lastPatchInFlight;
      },
    });

    // cs-round-011:retry wrapper 调用 streamText 真正构造一次 — 重试场景下
    //   builder 每次都 fresh,闭包 state(accumulatedText 等)跟着新 attempt 重置。
    //   但 accumulatedText 已经被 continueFromInitialText 初始化过,我们要保留
    //   重试仍 PATCH 同一条 message id + 已有文本前缀,避免 retry 把已有
    //   partial 内容覆盖丢。所以用 attempt-scoped closure,但 accumulatedText
    //   / accumulatedParts 保留 continueFrom 起点。
    // cs-round-011:retry wrapper 调用 streamText 真正构造一次 — 重试场景下
    //   builder 每次都 fresh,闭包 state(accumulatedText 等)跟着新 attempt 重置。
    //   但 accumulatedText 已经被 continueFromInitialText 初始化过,我们要保留
    //   重试仍 PATCH 同一条 message id + 已有文本前缀,避免 retry 把已有
    //   partial 内容覆盖丢。所以用 attempt-scoped closure,但 accumulatedText
    //   / accumulatedParts 保留 continueFrom 起点。
    // 用宽松 any 标注 buildStream return — AI SDK 6.x streamText 内部泛型嵌套
    //   太深,手动推断会引出 StepResult 不兼容(inference 噪音),这里只用到
    //   .toUIMessageStream()/.text,两者类型不依赖 tool 泛型。
    /* eslint-disable @typescript-eslint/no-explicit-any -- streamText 内部泛型导致 StepResult 嵌套不兼容,这里放宽 */
    const result: any = await withStreamRetry<any>(() => buildStream() as any, {
      retries: 2,
      onAttempt: (n: number) => {
        if (n === 0) return; // 第一次不 warn
        // 重试时 accumulatedText **清回 continueFromInitialText**(否则旧 attempt 的
        //   delta 会和新 attempt 的 delta 叠到一起 double-write)
        if (accumulatedText !== continueFromInitialText) {
          accumulatedText = continueFromInitialText;
        }
        // accumulatedParts 同样从 continueFromInitialParts 起,清掉旧 attempt
        //   累积的 tool/reasoning parts(由后续 onChunk 重新 push)。
        // 注意:不要直接 reassign 闭包外部的 accumulatedParts 数组引用(onChunk/onStep
        //   在旧 attempt 已经持有的引用上 patch),改用 splice 清空。
        if (accumulatedParts.length > (continueFromInitialParts as unknown[]).length) {
          accumulatedParts.splice(
            (continueFromInitialParts as unknown[]).length,
            accumulatedParts.length - (continueFromInitialParts as unknown[]).length,
          );
        }
        accumulatedMetadata.toolCalls = [];
        accumulatedMetadata.toolCallCount = 0;
        accumulatedMetadata.lastStep = undefined;
        chunkCount = 0;
        lastChunkType = '';
        // accumulatedTextPart 是旧 attempt text-delta 创建的 ref,清掉让 onChunk 重建
        accumulatedTextPart = null;
        // 上次 attempt 的 PATCH timer 也要清,避免旧 timer 把 stale state 写进去
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // ============= 包装 UI 流(沿用 W3-4 的 message-metadata 机制) =============
    const stream = createUIMessageStream({
      originalMessages: messages,
      execute: async ({ writer }) => {
        // W11:writer 操作包 try/catch — client disconnect 后 HTTP response body
        // 已 close,writer.write / writer.merge 内部 enqueue 会抛错。这些错只意味着
        // 「没法推给浏览器」,**不应阻断 streamText 完成**(否则又退回 status=3)。
        const safeWrite = (chunk: Parameters<typeof writer.write>[0], label: string) => {
          try {
            writer.write(chunk);
          } catch (e) {
            console.warn(
              `[chat] writer.write ${label} failed (client disconnected):`,
              (e as Error).message,
            );
          }
        };
        try {
          // 1) 先发 tools metadata(让前端尽早展示「4 个客服工具已就绪」)
          safeWrite(
            { type: 'message-metadata', messageMetadata: { tools: toolsMeta } },
            'toolsMeta',
          );

          // 2) 合并 LLM 的 UI 流(text-delta / tool-part / finish 等)。
          //    TransformStream 做两件事:
          //    a) drop reasoning-* chunk — 渲染走 metadata.reasoning(后端 PATCH
          //       落库,刷新后看折叠区),实时流式不展示给前端。
          //    b) 剥掉所有 chunk 的 providerMetadata 字段 — dashscope(走 OpenAI
          //       兼容模式)会在 text-delta / tool-* / start 等几乎所有 chunk 上挂
          //       providerMetadata.openai.itemId。该字段不在 AI SDK 6.x 期望的
          //       chunk schema 中,client useChat 收到后 Object.transform 抛错
          //       (index.mjs:5743:15)→ SerialJobExecutor 内部没人 catch →
          //       unhandled rejection → Next.js dev 错误覆盖层("未知错误")。
          //       上次只过滤 reasoning 是漏的(text-delta 等也会带),retry 时
          //       必现。strip providerMetadata 不影响渲染(客户端不用该字段)。
          const uiStream = result.toUIMessageStream().pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                if (chunk.type?.startsWith('reasoning')) return;
                if ('providerMetadata' in chunk) {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 仅借用 destructure 删字段,不需要变量
                  const { providerMetadata: _stripped, ...clean } = chunk;
                  controller.enqueue(clean as typeof chunk);
                  return;
                }
                controller.enqueue(chunk);
              },
            }),
          );
          // writer.merge 是 fire-and-forget(void 返回);source stream(也就是 streamText)
          // 继续跑。client 断开后 merge 内部 enqueue 抛错会被 SDK 自己吞(或写进内部队列),
          // 不应阻断 streamText — 已包在 route handler 的 try/finally 里。
          writer.merge(uiStream);

          // 3) 等 streamText 自然完成 — 不管 client 是否还在(disconnect 不再 abort)
          try {
            await result.text;
          } catch (err) {
            // 真·业务错误(LLM 401 / MCP 错 / 模型崩),走 onError PATCH status=4。
            // 注:streamText 已不绑 req.signal,所以这里 req.signal.aborted 不再是
            // 触发条件(为兼容历史调用,仍保留检查 + warn)。
            if (req.signal.aborted) {
              console.warn(
                '[chat] req.signal aborted but streamText errored independently (ignoring)',
              );
            }
            throw err;
          }

          // 4) 正常完成:发 retrieval metadata
          safeWrite(
            { type: 'message-metadata', messageMetadata: { retrieval: retrievalMeta } },
            'retrieval',
          );

          // 等所有 PATCH 落盘(尤其是 onFinish 的 status=1)
          await lastPatchInFlight;
        } finally {
          // MCP client 必须关!否则子进程泄漏,9529 端口会越来越卡
          await mcp.close().catch((err) => console.error('[chat] mcp close failed:', err));
        }
      },
      onError: (err) => {
        console.error('[chat] stream error:', err);
        // 流式失败:写 status=4 error 区分用户主动 abort(status=3)
        accumulatedMetadata.errorAt = new Date().toISOString();
        accumulatedMetadata.errorMessage = err instanceof Error ? err.message : String(err);
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
        flushPatch(4);
        lastPatchInFlight.then().catch(() => null);
        return serializeError(err);
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    console.error('[chat] request error:', err);
    return new Response(JSON.stringify({ error: serializeError(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

function serializeError(err: unknown): string {
  if (err == null) return 'unknown error';
  if (err instanceof Error) {
    const details = err as unknown as {
      status?: string | number;
      code?: string | number;
    };
    const parts = [
      err.name,
      err.message,
      details.status ? `status=${details.status}` : null,
      details.code ? `code=${details.code}` : null,
    ].filter(Boolean);
    return parts.join(' | ');
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
