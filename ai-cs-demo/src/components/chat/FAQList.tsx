'use client'

/**
 * FAQList:把欢迎页 6 张快捷卡片单独抽出来的"通用版"。
 *
 * 来源:从 page.tsx / WelcomeMessage 抽出。区别:
 * - WelcomeMessage 自带"您好,我是小服"标题 + 卡片网格,常用于空状态
 * - FAQList 只渲染卡片网格,父组件可以传任意 list,用于比如侧栏 / Footer 等位置
 */

export interface FAQItem {
  icon: string
  title: string
  question: string
}

export interface FAQListProps {
  items: FAQItem[]
  onSelect: (question: string) => void
  disabled?: boolean
}

export function FAQList({ items, onSelect, disabled }: FAQListProps) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full"
      data-testid="faq-list"
    >
      {items.map((q) => (
        <button
          key={q.title}
          type="button"
          onClick={() => onSelect(q.question)}
          disabled={disabled}
          data-faq-title={q.title}
          className="rounded-2xl p-4 text-left shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-sm"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="text-2xl mb-2">{q.icon}</div>
          <div
            className="font-semibold text-sm mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            {q.title}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {q.question}
          </div>
        </button>
      ))}
    </div>
  )
}