/**
 * Day 9 F7:export-session.ts 单元自测
 * 跑法:pnpm tsx scripts/test-export-session.ts
 * 退出码:0 全过,1 有失败
 *
 * 测什么:
 *  - exportToJSON:能 stringify 出合法 JSON,含 version / exportedAt / session 结构
 *  - exportToMarkdown:含会话标题 / 消息角色 / 工具调用 / 检索引用 / 工单号
 *  - makeExportFilename:含标题 slug + 时间戳 + 正确后缀
 */

import type { UIMessage } from 'ai'
import { exportToJSON, exportToMarkdown, makeExportFilename } from '../src/lib/export-session'
import type { Session } from '../src/hooks/use-sessions'

let pass = 0
let fail = 0
const failures: string[] = []

function assert(cond: boolean, label: string) {
  if (cond) {
    pass++
    console.log(`  ✅ ${label}`)
  } else {
    fail++
    failures.push(label)
    console.log(`  ❌ ${label}`)
  }
}

// 一个最小可用的 mock session(参考 use-sessions.ts 的 Session 形状 — cs-round-013 纯元数据版)
const mockSession: Session = {
  id: 1,
  sessionKey: 'cs-test123',
  title: '如何申请退款',
  messageCount: 2,
  startedAt: new Date(Date.now() - 3600_000).toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockMessages: UIMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: '如何申请退款' }],
  } as unknown as UIMessage,
  {
    id: 'a1',
    role: 'assistant',
    metadata: {
      retrieval: {
        query: '如何申请退款',
        topK: 3,
        results: [
          { ref: '[1]', source: 'refund-policy.md', score: 0.85, preview: '退款政策预览', text: '...' },
        ],
      },
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, cost: 0.002 },
    },
    parts: [
      { type: 'reasoning', text: '用户问退款,需要调 search_faq' },
      {
        type: 'dynamic-tool',
        toolName: 'search_faq',
        toolCallId: 'call_001',
        state: 'output-available',
        input: { query: '如何申请退款', topK: 3 },
        output: { results: '[1] refund-policy.md: 退款政策预览...' },
      },
      { type: 'text', text: '申请退款步骤:1) 订单页 → 申请退款;2) 选原因;3) 24h 内审核。' },
    ],
  } as unknown as UIMessage,
];

const mockEscalationMap = {
  a1: { escalationId: 'ESC-2026-001', estimatedWaitMinutes: 15, urgency: 'normal' },
}

console.log('\n=== F7 export-session.ts 自测 ===\n')

console.log('[exportToJSON]')
const json = exportToJSON(mockSession, mockMessages)
const parsed = JSON.parse(json)  // 必须能 parse 才是合法 JSON
assert(parsed.version === 1, 'JSON 含 version=1')
assert(typeof parsed.exportedAt === 'string', 'JSON 含 exportedAt ISO 字符串')
assert(parsed.session?.id === 1, 'JSON session.id 正确')
assert(parsed.session?.title === '如何申请退款', 'JSON session.title 正确')
assert(Array.isArray(parsed.session?.messages), 'JSON session.messages 是数组')
assert(parsed.session?.messages?.length === 2, 'JSON session.messages 长度 = 2')
assert(parsed.session?.messages?.[1]?.parts?.length === 3, 'JSON 第 2 条消息 parts 长度 = 3 (reasoning + tool + text)')
assert(json.includes('如何申请退款'), 'JSON 含用户消息文本')
assert(json.includes('search_faq'), 'JSON 含工具名 search_faq')

console.log('\n[exportToMarkdown]')
const md = exportToMarkdown(mockSession, mockMessages, mockEscalationMap)
assert(md.includes('# 如何申请退款'), 'MD 标题含会话名')
assert(md.includes('会话 ID') && md.includes('1'), 'MD 元信息含会话 ID (cs-round-013: 数字 id)')
assert(md.includes('👤 用户'), 'MD 含用户角色标识')
assert(md.includes('🤖 AI'), 'MD 含 AI 角色标识')
assert(md.includes('💭'), 'MD 含推理 emoji')
assert(md.includes('🔧 **search_faq**'), 'MD 含工具调用标签')
assert(md.includes('**输入**'), 'MD 含工具输入段')
assert(md.includes('**输出**'), 'MD 含工具输出段')
assert(md.includes('refund-policy.md'), 'MD 含检索来源文件名')
assert(md.includes('ESC-2026-001'), 'MD 含工单号(escalationMap 透传)')
assert(md.includes('申请退款步骤'), 'MD 含 AI 最终答案文本')
assert(md.includes('📋 元数据'), 'MD 含元数据 details 块')
assert(md.includes('¥'), 'MD 含费用字段')

console.log('\n[makeExportFilename]')
const nameJSON = makeExportFilename(mockSession, 'json')
const nameMD = makeExportFilename(mockSession, 'md')
assert(nameJSON.endsWith('.json'), 'JSON 文件名以 .json 结尾')
assert(nameMD.endsWith('.md'), 'MD 文件名以 .md 结尾')
assert(nameJSON.includes('如何申请退款') || nameJSON.includes('如何'), 'JSON 文件名含会话标题')
assert(/\d{8}-\d{4}\.json$/.test(nameJSON), 'JSON 文件名含 YYYYMMDD-HHmm 时间戳')
// 非法字符测试
const sessUnsafe: Session = { ...mockSession, title: '问?/题|名字*' }
const safeName = makeExportFilename(sessUnsafe, 'json')
assert(!/[\\/:*?"<>|]/.test(safeName), '文件名过滤非法字符')
assert(safeName.endsWith('.json'), '过滤后仍以 .json 结尾')

console.log('\n=== 结果 ===')
console.log(`通过: ${pass} / 失败: ${fail}`)
if (fail > 0) {
  console.log('\n失败项:')
  failures.forEach(f => console.log(`  - ${f}`))
  process.exit(1)
}
console.log('✅ 全部通过')
