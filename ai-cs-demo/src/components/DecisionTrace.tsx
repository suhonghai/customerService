'use client'

/**
 * 决策过程面板(W9-10 F4):渲染 AI 思考链 + 工具调用
 *
 * 跟 W5-6 / W7-8 的 page.tsx 内联决策面板区别:
 *  - W5-6 / W7-8 工具是本地 + MCP 混合,需要 MCP_TOOL_NAMES 白名单区分(🔧 vs 📁)
 *  - W9-10 客服场景 4 工具(search_faq / get_user_order / create_ticket / escalate_to_human)
 *    **全部走 MCP server** —— 统一标 📁 即可,不用白名单
 *
 * 接收 m.parts(AI SDK 6.x 真实 part 数组),按**原始顺序**遍历(不分组):
 *   - type === 'reasoning'  → 💭 思考链段
 *   - type === 'tool-${name}' / 'dynamic-tool' → 📁 工具调用(input/output/state)
 *
 * state ∈ input-streaming | input-available | output-available | output-error | ...
 *
 * 实现说明:用 `any` 而非精确类型(AI SDK 6.x 的 UIMessagePart union 嵌套太深,
 * 跨项目 type 经常对不上,但运行时结构稳定)。这是 W5-6 修过的坑,见 memory。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPart = any

export function DecisionTrace({
  parts,
  hasText = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts: any[]
  /** 最终答案是否已出现 — 控制 panel 默认展开(进行中)vs 收起(已完成) */
  hasText?: boolean
}) {
  // 过滤出决策步骤(reasoning + tool-* + dynamic-tool),保持原顺序
  const decisionSteps: AnyPart[] = (parts ?? []).filter(
    (p) =>
      p.type === 'reasoning' ||
      (typeof p.type === 'string' && p.type.startsWith('tool-')) ||
      p.type === 'dynamic-tool',
  )

  if (decisionSteps.length === 0) return null

  const toolCallCount = decisionSteps.filter(
    (p) =>
      (typeof p.type === 'string' && p.type.startsWith('tool-')) ||
      p.type === 'dynamic-tool',
  ).length
  const reasoningChunkCount = decisionSteps.filter(
    (p) => p.type === 'reasoning',
  ).length

  return (
    <details
      className="mb-2 text-xs rounded-2xl p-3 mt-2"
      style={{
        background: '#18181b', // zinc-900
        color: '#e4e4e7', // zinc-200
        border: '1px solid #27272a', // zinc-800
      }}
      open={!hasText}
    >
      <summary
        className="cursor-pointer font-semibold uppercase tracking-wide"
        style={{ color: '#a1a1aa', fontSize: '11px' }} // zinc-400
      >
        🤖 DEBUG · AI 决策过程(
        {reasoningChunkCount > 0 && `💭 ${reasoningChunkCount} 段推理`}
        {reasoningChunkCount > 0 && toolCallCount > 0 && ' · '}
        {toolCallCount > 0 && `📁 ${toolCallCount} 次工具`}
        ){!hasText && ' — 进行中...'}
      </summary>
      <div className="mt-3 space-y-3">
        {decisionSteps.map((p, i) => {
          if (p.type === 'reasoning') {
            return (
              <div
                key={i}
                className="pl-3 py-1.5"
                style={{ borderLeft: '2px solid #a78bfa' }} // violet-400
              >
                <div
                  className="font-medium mb-1"
                  style={{ color: '#c4b5fd', fontSize: '11px' }} // violet-300
                >
                  💭 推理 #{i + 1}
                </div>
                <div
                  className="whitespace-pre-wrap mono"
                  style={{ color: '#d4d4d8', fontSize: '11px' }} // zinc-300
                >
                  {p.text}
                </div>
              </div>
            )
          }
          // === 工具调用 ===
          const toolName =
            p.type === 'dynamic-tool'
              ? p.toolName ?? 'unknown'
              : p.type.replace(/^tool-/, '')
          const inputStr =
            p.input != null ? JSON.stringify(p.input, null, 2) : null
          const outputStr =
            p.output != null ? JSON.stringify(p.output, null, 2) : null
          const stateLabel =
            {
              'input-streaming': '组装参数中...',
              'input-available': '调用中...',
              'output-available': '已返回',
              'output-error': '出错',
            }[p.state as string] || p.state || '未知'
          const stateBg =
            p.state === 'output-available'
              ? { background: '#14532d', color: '#86efac' } // green-900/300
              : p.state === 'output-error'
                ? { background: '#7f1d1d', color: '#fca5a5' } // red-900/300
                : { background: '#713f12', color: '#fde047' } // yellow-900/300
          return (
            <div
              key={i}
              className="pl-3 py-1.5"
              style={{ borderLeft: '2px solid #fbbf24' }} // amber-400
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="mono"
                  style={{ color: '#fcd34d', fontSize: '11px' }} // amber-300
                >
                  📁 {toolName}
                </span>
                <span
                  className="ml-auto px-2 py-0.5 rounded-full text-[10px] mono"
                  style={stateBg}
                >
                  {stateLabel}
                </span>
              </div>
              {inputStr && (
                <details className="mt-1.5">
                  <summary
                    className="cursor-pointer"
                    style={{ color: '#a1a1aa', fontSize: '11px' }}
                  >
                    参数
                  </summary>
                  <pre
                    className="mt-1 p-2 rounded mono"
                    style={{
                      background: '#09090b',
                      color: '#d4d4d8',
                      fontSize: '10px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {inputStr}
                  </pre>
                </details>
              )}
              {outputStr && (
                <details className="mt-1.5">
                  <summary
                    className="cursor-pointer"
                    style={{ color: '#a1a1aa', fontSize: '11px' }}
                  >
                    结果
                  </summary>
                  <pre
                    className="mt-1 p-2 rounded mono overflow-auto"
                    style={{
                      background: '#09090b',
                      color: '#d4d4d8',
                      fontSize: '10px',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '8rem',
                    }}
                  >
                    {outputStr}
                  </pre>
                </details>
              )}
              {p.errorText && (
                <div
                  className="mt-1"
                  style={{ color: '#fca5a5', fontSize: '10px' }}
                >
                  {p.errorText}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}
