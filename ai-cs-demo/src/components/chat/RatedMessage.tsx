'use client';

/**
 * RatedMessage:已评分的 AI 消息附加块(评分摘要)。
 *
 * 来源:从 page.tsx 抽出来,展示"已评分 / 高分 / 低分"提示。
 * 注意:实际评分按钮用现有的 RatingButtons 组件,本组件只渲染"评分后"的状态文案。
 *
 * 为什么单独抽:评分是 messageId → 'up' | 'down' 的映射,
 * 本组件读 localStorage('cs_ratings')取评分,然后渲染对应提示。
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cs_ratings';

function readRating(messageId: string): 'up' | 'down' | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, 'up' | 'down'>;
    return map[messageId] ?? null;
  } catch {
    return null;
  }
}

export interface RatedMessageProps {
  messageId: string;
}

export function RatedMessage({ messageId }: RatedMessageProps) {
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- SSR-safe mount hydration(localStorage 只能在 effect 里读);组件 keyed by messageId,remount 时会重跑 */
  useEffect(() => {
    setRating(readRating(messageId));
  }, [messageId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!rating) return null;

  return (
    <div
      className="text-[11px] mt-1 px-1"
      style={{ color: 'var(--text-tertiary)' }}
      data-testid={`rated-${messageId}`}
    >
      {rating === 'up' ? '👍 已点赞' : '👎 已点踩'}
    </div>
  );
}
