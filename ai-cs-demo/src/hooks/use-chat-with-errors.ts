'use client'

import { useChat } from '@ai-sdk/react'
import { toUserMessage, type UserFacingError } from '@/lib/errors'

/**
 * useChatWithErrors:对 useChat 的薄包装
 *
 * 唯一做的事:把 useChat 的 error state 过 toUserMessage 分类,
 * 给出前端可直接渲染的 UserFacingError(action 按钮的回调用法见 page.tsx)。
 *
 * useChat 自带的 stop() / sendMessage / messages / status / error 全部透传。
 *
 * 上传/检索等非 chat 错误不归这里管,各自在调用处用 toUserMessage 转换。
 */
export function useChatWithErrors() {
  const chat = useChat()
  const userError: UserFacingError | null = chat.error
    ? toUserMessage(chat.error)
    : null
  return { ...chat, userError }
}
