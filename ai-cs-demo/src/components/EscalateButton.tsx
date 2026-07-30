'use client';

import { useState } from 'react';
import type { UserFacingError } from '@/lib/errors';
import { ErrorBubble } from '@/components/ErrorBubble';

/**
 * W9-10 Day 8 (F5):转人工按钮
 *
 * 设计:
 *  - 按钮位置:每个 AI 消息气泡下方(展开,易于发现)
 *  - 点击后:走 POST /api/escalate → 后端调 MCP escalate_to_human → 返 escalationId
 *  - 成功后:onEscalated(escalationId) 回调,父组件把工单号气泡塞到 messages 里
 *  - 失败后:局部展示 ErrorBubble(不污染全局 streamError)
 *
 * 选项(plan):
 *  - A 走 AI 聊天气泡:C 派去调 create_ticket,前端拿 ticketId 显示 — 当前用这个
 *  - B 走独立 API route:实测更可控(浏览器调不动 stdio MCP),所以走 /api/escalate
 *  - C 走 system prompt 引导:不靠谱,LLM 不一定调对工具
 */

export interface EscalateButtonProps {
  /** 调 /api/escalate 时带的转人工原因(最后一条用户消息 / AI 答不上来的原因) */
  reason: string;
  /** 可选:紧急程度(默认 'normal') */
  urgency?: 'normal' | 'urgent';
  /** 成功后回调,父组件拿到 escalationId 后渲染工单号气泡 */
  onEscalated?: (info: {
    escalationId: string;
    estimatedWaitMinutes: number;
    urgency: string;
  }) => void;
  /** 可选:禁用(loading / streaming 期间) */
  disabled?: boolean;
  /**
   * W9-10 Day 9:前端 activeId 透传到 /api/escalate,backend 用它
   * 查 cs_session 拿到 sessionId 挂到 cs_ticket,运营回复时 reply()
   * bridge 才能写回 cs_message 给前端 WS 收。
   */
  sessionKey?: string;
}

export function EscalateButton({
  reason,
  urgency = 'normal',
  onEscalated,
  disabled = false,
  sessionKey,
}: EscalateButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);

  async function handleClick() {
    if (submitting || disabled) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, urgency, sessionKey }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        escalationId?: string;
        estimatedWaitMinutes?: number;
        urgency?: string;
        error?: string;
        userError?: UserFacingError;
      };
      if (!data.ok || !data.escalationId) {
        setError(
          data.userError ?? {
            title: data.error ?? '转人工失败',
            hint: '请稍后再试,或刷新页面重试。',
          },
        );
        return;
      }
      onEscalated?.({
        escalationId: data.escalationId,
        estimatedWaitMinutes: data.estimatedWaitMinutes ?? 15,
        urgency: data.urgency ?? urgency,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '网络错误,请检查连接后重试。';
      setError({
        title: '转人工请求失败',
        hint: msg,
        raw: err,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting || disabled}
        className="inline-flex items-center text-xs px-3 py-1 rounded-full transition-colors disabled:opacity-50"
        style={{
          background: 'var(--brand-primary-soft)',
          color: 'var(--brand-primary)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = '#ffe4d6';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
        }}
        title="转人工客服(调 MCP escalate_to_human)"
      >
        🙋 {submitting ? '转接中...' : '转人工'}
      </button>
      {error && (
        <div className="mt-2">
          <ErrorBubble
            error={error}
            onAction={() => {
              // 局部错误,只清掉自己;不触发全局 reload / reset
              setError(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 工单号气泡:在 messages 列表里追加一条特殊 system-like 消息
 *
 * 这里不用 system 角色(useChat 不渲染 system),而是用 role: 'assistant' + 一个标记字段,
 * 由 page.tsx 渲染时识别。简单实现:由父组件在 m.parts 里塞一个特殊的 marker 文本 part。
 *
 * 实际上,本文件只暴露 EscalateBubble 一个 React 组件,工单号展示是 page.tsx 的事;
 * 这里只导出工单号气泡组件供 page.tsx 复用。
 */
export function EscalateBubble({
  escalationId,
  estimatedWaitMinutes,
  urgency,
}: {
  escalationId: string;
  estimatedWaitMinutes: number;
  urgency: string;
}) {
  return (
    <div
      className="mt-2 inline-flex items-start gap-2 text-xs px-4 py-3 rounded-2xl"
      style={{
        background: '#ecfdf5', // emerald-50
        border: '1px solid #a7f3d0', // emerald-200
        color: '#065f46', // emerald-800
      }}
    >
      <span className="text-base leading-none">🙋</span>
      <div>
        <div className="font-medium">
          已转人工客服,工单号{' '}
          <span className="mono" style={{ color: '#064e3b' }}>
            #{escalationId}
          </span>
        </div>
        <div className="mt-0.5" style={{ color: '#047857' }}>
          预计等待 {estimatedWaitMinutes} 分钟
          {urgency === 'urgent' && (
            <span
              className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full"
              style={{
                background: '#fee2e2',
                color: 'var(--error)',
              }}
            >
              加急
            </span>
          )}
          。客服会尽快与您联系,期间您可以继续对话。
        </div>
      </div>
    </div>
  );
}
