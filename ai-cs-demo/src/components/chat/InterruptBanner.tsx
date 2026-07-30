'use client';

/**
 * InterruptBanner:已中断(被取消)的 AI 消息下方提示条。
 *
 * 来源:从 page.tsx 的 inline 中断提示 JSX 抽出。
 *
 * 设计:
 * - "上次回答没写完" + 「继续生成」按钮:点 → 父组件调 sendMessage('请继续')
 * - "上次回答没收到完整内容" + 「重试」按钮:点 → 父组件调 regenerate({ messageId })
 *
 * 父组件根据 (text 是否存在) 和 (metadata.isInterrupted) 决定渲染哪种变体。
 */

export interface InterruptBannerProps {
  /** 当前 AI 消息是否有 text(有则说"没写完",无则说"没收到完整内容") */
  hasText: boolean;
  /** 后端是否标记中断(metadata.isInterrupted = true) — 决定显示"继续生成"还是"重试" */
  isInterrupted: boolean;
  /** 触发"继续生成"(发"请继续") */
  onContinue: () => void;
  /** 触发"重试"(regenerate) */
  onRetry: () => void;
  /** 最后一种 stream chunk 类型,用来在中断时精准提示"正在调用工具/思考" */
  lastChunkType?: string;
  /** 后端标记错误(status=4) — 显示"AI 回答出错了" + 重试 */
  isError?: boolean;
  /** 后端错误消息(可选用作副标题) */
  errorMessage?: string;
}

export function InterruptBanner({
  hasText,
  isInterrupted,
  onContinue,
  onRetry,
  lastChunkType,
  isError,
  errorMessage,
}: InterruptBannerProps) {
  // 后端标记的"错误"(status=4)→ 走重试
  if (isError) {
    return (
      <div className="text-sm mt-2 pt-2" style={{ color: 'var(--color-error, #d4380d)' }}>
        <span>
          AI 回答出错了。
          {errorMessage && `(${errorMessage.slice(0, 80)})`}
        </span>
        <button
          type="button"
          onClick={onRetry}
          data-testid="retry-btn"
          className="ml-2 underline hover:no-underline"
          style={{ color: 'var(--brand-primary)' }}
        >
          重试
        </button>
      </div>
    );
  }

  // 后端标记的"中断"(status=2/3)→ 走继续生成
  if (isInterrupted) {
    // 根据 lastChunkType 给更精准的"正在 X 时被中断"文案
    let interruptedLabel = hasText ? '上次回答没写完。' : '上次回答没收到完整内容。';
    if (!hasText) {
      if (lastChunkType?.startsWith('tool-')) {
        interruptedLabel = 'AI 正在调用工具时被中断。';
      } else if (lastChunkType === 'reasoning' || lastChunkType?.startsWith('reasoning-')) {
        interruptedLabel = 'AI 正在思考时被中断。';
      }
    }
    return (
      <div
        className="text-sm mt-2 pt-2"
        style={{
          color: 'var(--text-tertiary)',
          borderTop: hasText ? '1px solid var(--border)' : 'none',
        }}
      >
        <span>{interruptedLabel}</span>
        <button
          type="button"
          onClick={onContinue}
          data-testid="continue-btn"
          className="ml-2 underline hover:no-underline"
          style={{ color: 'var(--brand-primary)' }}
        >
          继续生成
        </button>
      </div>
    );
  }

  // 本地丢失:有 message 但无 text 且非中断标记 → regenerate 兜底
  return (
    <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
      <span>上次回答没收到完整内容。</span>
      <button
        type="button"
        onClick={onRetry}
        data-testid="retry-btn"
        className="ml-2 underline hover:no-underline"
        style={{ color: 'var(--brand-primary)' }}
      >
        重试
      </button>
    </div>
  );
}
