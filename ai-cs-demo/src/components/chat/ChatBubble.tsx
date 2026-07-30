'use client';

/**
 * 单条消息气泡(纯展示)。
 *
 * 接收已抽出来的纯数据(role / text / metadata / aborted / status / timestamp),
 * 不直接订阅 useChat,让父组件 page.tsx 控制数据流,本组件只负责排版。
 */

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ChatBubbleProps {
  role: 'user' | 'assistant' | 'system' | 'tool' | string;
  text: string;
  reasoning?: string;
  /** 真人客服消息的元数据 — source='operator' 时显示工单号/客服名条头 */
  operatorBadge?: { ticketNo?: string; operatorName?: string };
  /** 是否被用户取消(aborted) */
  aborted?: boolean;
  /** 流式状态:仅 assistant 且无 text 时显示"准备回答中..."占位 */
  status?: 'submitted' | 'streaming' | 'ready' | 'error';
  /** 调试用检索详情 */
  retrieval?: {
    query: string;
    topK: number;
    results: Array<{
      ref: string;
      source: string;
      index: number;
      score: number;
      preview: string;
    }>;
  };
  /** token 用量(AI 消息下方一行) */
  usage?: { totalTokens: number; cost: number };
  /** 是否展示 DEBUG 面板(由父组件根据 NEXT_PUBLIC_DEBUG_RETRIEVAL 控制) */
  showDebugRetrieval?: boolean;
  /** 是否展示 AI 决策过程面板(由父组件根据 NEXT_PUBLIC_DEBUG_TRACE 控制) */
  showDebugTrace?: boolean;
  /** AI 决策过程(DEBUG 面板内容)— 仅 assistant 显示 */
  decisionTrace?: ReactNode;
  /** 中断提示的操作区(继续生成 / 重试) */
  interruptAction?: ReactNode;
  /** 时间戳(已 format) */
  timeLabel: string;
  /** 评分按钮(仅 assistant 显示) */
  rating?: ReactNode;
  /** 转人工按钮 / 工单号气泡(仅 assistant 显示) */
  escalation?: ReactNode;
}

export function ChatBubble({
  role,
  text,
  reasoning,
  operatorBadge,
  aborted,
  status,
  retrieval,
  usage,
  showDebugRetrieval,
  showDebugTrace,
  decisionTrace,
  interruptAction,
  timeLabel,
  rating,
  escalation,
}: ChatBubbleProps) {
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  return (
    <div
      className={`flex gap-2 md:gap-3 animate-fade-in-up ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {/* AI 头像(渐变 40x40 圆形,内含 🛍️)— 用户消息不显示 */}
      {isAssistant && (
        <span
          className="shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-2xl flex items-center justify-center text-base md:text-lg shadow-sm"
          style={{
            background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)',
          }}
          aria-hidden="true"
        >
          🛍️
        </span>
      )}

      <div className={`min-w-0 ${isUser ? 'max-w-[80%]' : 'max-w-[85%]'}`}>
        {/* 气泡 */}
        {isUser ? (
          <div
            className="rounded-3xl rounded-tr-md px-4 py-2.5 md:px-5 md:py-3 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)',
              color: '#ffffff',
            }}
          >
            <div className="whitespace-pre-wrap break-words">{text}</div>
          </div>
        ) : (
          <div
            className="rounded-3xl rounded-tl-md px-4 py-2.5 md:px-5 md:py-3 shadow-sm"
            style={{
              background: 'var(--surface-elevated)',
              color: 'var(--text-primary)',
              opacity: aborted ? 0.65 : 1,
              border: '1px solid var(--border)',
            }}
          >
            {isAssistant && showDebugTrace && decisionTrace}

            {operatorBadge && (operatorBadge.ticketNo || operatorBadge.operatorName) && (
              <div className="flex items-center gap-2 text-[11px] mb-1.5">
                {operatorBadge.ticketNo && (
                  <span
                    className="px-2 py-0.5 rounded font-semibold"
                    style={{ background: '#d1fae5', color: '#065f46' }}
                  >
                    工单 {operatorBadge.ticketNo}
                  </span>
                )}
                {operatorBadge.operatorName && (
                  <span
                    className="px-2 py-0.5 rounded"
                    style={{ background: '#ecfdf5', color: '#047857' }}
                  >
                    客服 · {operatorBadge.operatorName}
                  </span>
                )}
              </div>
            )}

            {reasoning && (
              <details className="mb-2 text-xs">
                <summary
                  className="cursor-pointer select-none text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <span>💭</span>
                  <span>思考过程</span>
                </summary>
                <pre
                  className="mt-1.5 p-2 rounded whitespace-pre-wrap break-words italic"
                  style={{
                    backgroundColor: 'var(--surface-secondary, #f5f5f5)',
                    color: 'var(--text-secondary, #6b7280)',
                    fontSize: '0.85em',
                    maxWidth: '100%',
                  }}
                >
                  {reasoning}
                </pre>
              </details>
            )}

            {text && (
              <div className="markdown-body break-words [&_p]:my-1.5 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_strong]:font-bold [&_em]:italic [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-black/5 [&_code]:text-[0.9em] [&_pre]:my-2 [&_pre]:p-2 [&_pre]:rounded-lg [&_pre]:bg-black/5 [&_pre]:overflow-x-auto [&_table]:my-2 [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_a]:underline [&_a]:text-blue-600 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:my-1.5 [&_blockquote]:opacity-80">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // react-markdown 10.x 透传 node;剥掉(DOM a 不需要)+ 强制安全属性
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- react-markdown 10.x 强制 node prop 入参
                    a: ({
                      node: _omitNode,
                      ...rest
                    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => (
                      <a {...rest} target="_blank" rel="noopener noreferrer" />
                    ),
                  }}
                >
                  {text}
                </ReactMarkdown>
              </div>
            )}

            {aborted && (
              <div
                className="text-xs italic mt-2 pt-2"
                style={{
                  color: 'var(--text-tertiary)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                ⛔ 已被用户取消(保留了已生成的部分)
              </div>
            )}

            {isAssistant && !text && (status === 'submitted' || status === 'streaming') && (
              <div className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                准备回答中...
              </div>
            )}

            {isAssistant && interruptAction}

            {/* 检索详情 DEBUG 面板 */}
            {isAssistant && showDebugRetrieval && retrieval?.results && (
              <details
                className="mt-3 text-xs rounded-2xl p-3"
                style={{
                  background: '#18181b',
                  color: '#e4e4e7',
                  border: '1px solid #27272a',
                }}
              >
                <summary
                  className="cursor-pointer font-semibold uppercase tracking-wide"
                  style={{ color: '#a1a1aa', fontSize: '11px' }}
                >
                  🔍 DEBUG · 检索详情(Top {retrieval.topK} · 命中 {retrieval.results.length} 块)
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="mono" style={{ color: '#a1a1aa' }}>
                    <span style={{ color: '#60a5fa' }}>查询:</span> {retrieval.query}
                  </div>
                  {retrieval.results.map((r, i) => (
                    <div
                      key={i}
                      className="pl-2 py-1.5"
                      style={{ borderLeft: '2px solid #60a5fa' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono" style={{ color: '#93c5fd' }}>
                          {r.ref}
                        </span>
                        <span style={{ color: '#d4d4d8' }}>📄 {r.source}</span>
                        <span style={{ color: '#a1a1aa' }}>第 {r.index + 1} 块</span>
                        <span
                          className="ml-auto px-2 py-0.5 rounded-full text-[10px] mono"
                          style={{
                            background:
                              r.score >= 0.7 ? '#14532d' : r.score >= 0.4 ? '#713f12' : '#7f1d1d',
                            color:
                              r.score >= 0.7 ? '#86efac' : r.score >= 0.4 ? '#fde047' : '#fca5a5',
                          }}
                        >
                          相似度 {r.score.toFixed(3)}
                        </span>
                      </div>
                      <div className="mt-1 italic" style={{ color: '#a1a1aa' }}>
                        {r.preview}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* 时间戳 + token 用量(AI 消息下方) */}
        <div
          className={`flex items-center gap-3 mt-1.5 text-[11px] px-1 ${
            isUser ? 'justify-end' : 'justify-start'
          }`}
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>{timeLabel}</span>
          {isAssistant && usage && (
            <>
              <span>·</span>
              <span>
                {usage.totalTokens} token · ¥{usage.cost.toFixed(4)}
              </span>
            </>
          )}
        </div>

        {/* 评分 / 转人工 */}
        {isAssistant && text && rating}
        {isAssistant && text && escalation}
      </div>
    </div>
  );
}
