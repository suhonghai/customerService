import { tool } from 'ai'
import type { ZodTypeAny, z } from 'zod'

/**
 * 工具 execute 接收的上下文 — 透传 AbortSignal 让工具能做 cancel
 *
 * AI SDK 6.x 的 tool execute 第二参数实际更长(有 toolCallId / messages / etc),
 * 我们只关心 signal;多余的字段这里不暴露,工具需要时直接从 ai 包拿。
 */
export interface ToolCtx {
  /** 来自请求的 AbortSignal,user 点 stop 后会触发 */
  signal: AbortSignal
}

/**
 * defineTool:工具工厂,统一接入
 *  1. AbortSignal 透传(让 get_weather / search_docs 的 fetch 能被 cancel)
 *  2. 错误结构化(工具内部 throw 时,defineTool catch → 返回 {error:true, message},
 *     Agent 看到后能"换思路"或"告诉用户搜不到",不会因为单个工具挂而整条流炸)
 *  3. signal aborted 仍然 re-throw(让 AI SDK 知道是取消,不是工具失败)
 */
export function defineTool<T extends ZodTypeAny, R>(spec: {
  description: string
  inputSchema: T
  execute: (input: z.infer<T>, ctx: ToolCtx) => Promise<R>
}) {
  return tool({
    description: spec.description,
    inputSchema: spec.inputSchema,
    execute: async (input, options) => {
      // AI SDK 6.x 的 tool execute 第二参数有 abortSignal;取不到就用 never-abort 的
      const signal =
        (options as { abortSignal?: AbortSignal } | undefined)?.abortSignal ??
        new AbortController().signal
      try {
        return await spec.execute(input as z.infer<T>, { signal })
      } catch (err) {
        // 取消:继续抛,让 AI SDK 把 stream 标为 aborted(前端路由层会捕获)
        if (signal.aborted) throw err
        // 其他错误:结构化返回(不 throw),让 Agent 看到 { error: true, message } 决定下一步
        return {
          error: true,
          message: err instanceof Error ? err.message : String(err),
        } as unknown as R
      }
    },
  })
}
