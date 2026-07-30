'use client'

/**
 * 欢迎页(空状态):大 avatar + 6 张快捷问题卡片。
 *
 * 来源:从 page.tsx 内联 JSX 抽出。
 * 卡片数据 QUICK_QUESTIONS 是组件内部的常量。
 */

export interface QuickQuestion {
  icon: string
  title: string
  question: string
}

const QUICK_QUESTIONS: QuickQuestion[] = [
  { icon: '📦', title: '快递时效', question: '快递一般几天能到?' },
  { icon: '🔄', title: '退换货', question: '我想退货怎么办?' },
  { icon: '🎟️', title: '优惠券', question: '优惠券怎么用?' },
  { icon: '🧾', title: '开发票', question: '怎么开发票?' },
  { icon: '🏅', title: '会员等级', question: '会员等级有什么权益?' },
  { icon: '📍', title: '查订单', question: '查一下我的订单' },
]

export interface WelcomeMessageProps {
  /** 用户点卡片时,触发 question 字符串;在 isLoading 时由父组件决定是否真发 */
  onSelectQuestion: (question: string) => void
  /** AI 流式时禁用卡片(避免误点把卡片内容当用户消息发送) */
  disabled?: boolean
}

export function WelcomeMessage({
  onSelectQuestion,
  disabled,
}: WelcomeMessageProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto py-12 animate-fade-in-up">
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-md mb-6"
        style={{
          background:
            'linear-gradient(135deg, var(--brand-primary) 0%, #ff8a5b 100%)',
        }}
      >
        🛍️
      </div>
      <h2
        className="display font-bold text-3xl md:text-4xl mb-2 text-center"
        style={{ color: 'var(--text-primary)' }}
      >
        您好,我是小服
      </h2>
      <p
        className="text-base text-center mb-10"
        style={{ color: 'var(--text-secondary)' }}
      >
        您身边的智能购物助手
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q.title}
            type="button"
            onClick={() => onSelectQuestion(q.question)}
            disabled={disabled}
            data-question={q.question}
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
      <p
        className="text-xs text-center mt-8"
        style={{ color: 'var(--text-tertiary)' }}
      >
        点击卡片直接发送,或下方输入框提问
      </p>
    </div>
  )
}