'use client'

import { Component, ReactNode } from 'react'
import { ErrorBubble } from './ErrorBubble'
import { toUserMessage } from '@/lib/errors'

interface Props {
  children: ReactNode
  /** fallback 区域标题(默认 "界面渲染异常") */
  title?: string
}

interface State {
  error: Error | null
}

/**
 * React Error Boundary:catch 渲染时崩溃(罕见,但一旦发生 UI 会变白屏)
 *
 * 包在 layout.tsx,作用范围是整页(主聊天区 + 上传区)
 * 不 catch:
 *   - 异步事件 handler(自己 try/catch)
 *   - 服务端 throw(由 route 自己的 catch + ErrorBubble 兜)
 *   - 自己的 stop()/fetch 中断(那是正常的 aborted)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // 真实项目这里会接 Sentry / 自己的日志服务
    // 学习项目:打到 console
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      const userError = toUserMessage(this.state.error)
      return (
        <div className="max-w-3xl mx-auto mt-12 p-4">
          <div className="text-center text-gray-500 mb-4 text-sm">
            {this.props.title ?? '界面渲染异常,已切换到降级模式'}
          </div>
          <ErrorBubble error={userError} onAction={() => this.reset()} />
        </div>
      )
    }
    return this.props.children
  }
}
