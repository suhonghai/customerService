'use client'

/**
 * MessageInput:聊天输入框 + 发送/停止按钮。
 *
 * 抽离自 page.tsx 内联 JSX,父组件通过 props 传入当前 input 值和事件 handler。
 * 不直接 useState input,让父组件决定何时清空 / 何时发送。
 */

import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react'

export interface MessageInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  /** 流式生成中显示"停止"按钮(调用 useChat.stop);否则显示"发送" */
  isLoading: boolean
  onStop: () => void
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  onStop,
}: MessageInputProps) {
  // cs-round-061:Enter 不直接调 onSubmit()(避免 button click + implicit submit 双源)
  // cs-round-065:不再依赖浏览器 HTML spec implicit submission(Enter 模拟 click
  //   default submit button)— e.preventDefault() 同时阻止了 implicit submission,
  //   prod 真实浏览器 Enter 完全无响应。修法:preventDefault 后显式调
  //   `form.requestSubmit()` 触发 submit event。`requestSubmit()` 是 programmatic
  //   submit,**不**经 button.click,所以即使 `<button disabled>` 也能触发 submit
  //   event(覆盖了 cs-round-061 没考虑到的"按钮 disabled + Enter 不发"边界)。
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
    }
  }

  function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 md:px-6 py-4 border-t"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex gap-2 md:gap-3 items-end max-w-3xl mx-auto">
        <textarea
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
            onChange(e.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="说点什么..."
          rows={1}
          disabled={isLoading}
          className="flex-1 rounded-2xl px-4 py-3 outline-none resize-none transition-all mono"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            maxHeight: '8rem',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand-primary)'
            e.currentTarget.style.boxShadow = '0 0 0 3px var(--brand-primary-soft)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            data-testid="stop-btn"
            className="rounded-2xl text-white px-5 py-3 transition-all active:scale-95"
            style={{ background: 'var(--error)' }}
          >
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            data-testid="send-btn"
            className="rounded-2xl text-white px-5 py-3 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--brand-primary)' }}
          >
            发送
          </button>
        )}
      </div>
      <div
        className="text-[11px] text-center mt-2"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Enter 发送 · Shift+Enter 换行
      </div>
    </form>
  )
}