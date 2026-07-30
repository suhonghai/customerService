import { z } from 'zod'
import { defineTool } from './define-tool'

/**
 * get_current_time - 返回服务器当前时间
 * 用途:让 AI 知道"现在几点"、"今天几号"
 * 体现手册 §4.6:Tool Calling + Zod
 */
export const getCurrentTime = defineTool({
  description:
    '返回服务器当前时间(ISO 格式 + 指定时区的可读字符串)。当用户问"现在几点"、"今天几号"、"现在是周几"时调用。',
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe(
        '时区,默认 Asia/Shanghai。例如:Asia/Tokyo、America/New_York',
      ),
  }),
  execute: async ({ timezone = 'Asia/Shanghai' }) => {
    // 纯本地操作,signal 在 defineTool wrapper 里备着,这里用不上
    const now = new Date()
    const iso = now.toISOString()
    try {
      const formatted = now.toLocaleString('zh-CN', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        weekday: 'long',
      })
      return { iso, timezone, formatted }
    } catch {
      // 无效时区:定义错误返回,让 Agent 决定 fallback
      throw new Error(`无效时区 ${timezone}`)
    }
  },
})
