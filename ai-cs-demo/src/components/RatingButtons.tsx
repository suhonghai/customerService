'use client';

import { useEffect, useState } from 'react';
import { getErpAdminClient } from '@/lib/erp-admin-client';

/**
 * W9-10 Day 8 (F6):消息评分
 *
 * 设计:
 *  - 每条 AI 消息下方 2 个按钮 👍 / 👎
 *  - 点击后写 localStorage(SSR 安全:mount 后再读)
 *  - 已点过的按钮高亮,不可再改
 *  - 累计统计:在 sidebar header 或 header 位置显示(由 RatingsStats 组件展示)
 *
 * localStorage schema:
 *   key = 'cs_ratings'
 *   value = JSON { [messageId]: 'up' | 'down', _total: number }
 *
 * 选用对象 map 而不是数组 — 查找 O(1),改动 message 评分时只改一个 key。
 *
 * 注:不向父组件发回调。评分是局部 UI 状态(localStorage 是单一来源),
 * 父组件不需要知道;统计组件独立订阅同一 localStorage。
 */

const STORAGE_KEY = 'cs_ratings';

export type Rating = 'up' | 'down';

export interface RatingsMap {
  [messageId: string]: Rating;
}

function readRatings(): RatingsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as RatingsMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeRatings(ratings: RatingsMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
  } catch {
    /* quota / disabled — silently ignore */
  }
}

export function RatingButtons({
  messageId,
  sessionId,
}: {
  messageId: string;
  /**
   * cs-round-043:backend csSession.id(整数)。可选 — 没传时仅写 localStorage
   * (降级到 Day 8 行为,不报错)。前端 messageId = String(csMessage.id),
   * sessionId = backend csSession.id(从 ChatView 透传)。
   */
  sessionId?: number;
}) {
  // mount 后再读,避免 SSR hydration mismatch
  const [rating, setRating] = useState<Rating | null>(null);
  const [hydrated, setHydrated] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- SSR-safe mount hydration(localStorage 只能在 effect 里读);组件 keyed by messageId,remount 时会重跑 */
  useEffect(() => {
    const all = readRatings();
    setRating(all[messageId] ?? null);
    setHydrated(true);
  }, [messageId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function set(newRating: Rating) {
    if (rating) return; // 已评分,不可再点
    const all = readRatings();
    all[messageId] = newRating;
    writeRatings(all); // 本地缓存 — UI 立刻反馈 + 跨设备 + 离线兜底
    setRating(newRating);
    // 通知同窗口的其他组件(用 storage event 不可靠,自定义事件更稳)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cs_ratings_changed'));
    }

    // cs-round-043:backend 同步(主路径)。失败仅 console.warn(localStorage 已存)
    // sessionId 优先用 prop 透传;没有时降级读 window.__csActiveSessionId
    // (RAGChat mount 时写入 — 见 lib/components/RAGChat.tsx)。都没有则纯本地。
    const effectiveSessionId =
      sessionId ??
      (typeof window !== 'undefined'
        ? (window as unknown as { __csActiveSessionId?: number })
            .__csActiveSessionId
        : undefined);
    if (effectiveSessionId !== undefined && /^\d+$/.test(messageId)) {
      const msgIdNum = Number(messageId);
      getErpAdminClient()
        .rateMessage(effectiveSessionId, msgIdNum, newRating === 'up' ? 1 : -1)
        .catch((e: unknown) => {
          // localStorage 已是缓存,失败不报错;console.warn 提示开发期排错
          console.warn('[rating persist] failed (localStorage kept):', e);
        });
    }
  }

  // mount 前不渲染,避免 hydration mismatch
  if (!hydrated) return null;

  const upActive = rating === 'up';
  const downActive = rating === 'down';

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => set('up')}
        disabled={!!rating}
        title={rating ? '已评 👍' : '这条回答有帮助'}
        className={`rounded-full px-3 py-1 transition-colors disabled:cursor-not-allowed`}
        style={
          upActive
            ? {
                background: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary)',
              }
            : {
                color: 'var(--text-secondary)',
              }
        }
        onMouseEnter={(e) => {
          if (!upActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--brand-primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!upActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }
        }}
        aria-label="有用"
      >
        👍 有用
      </button>
      <button
        type="button"
        onClick={() => set('down')}
        disabled={!!rating}
        title={rating ? '已评 👎' : '这条回答没帮助'}
        className={`rounded-full px-3 py-1 transition-colors disabled:cursor-not-allowed`}
        style={
          downActive
            ? {
                background: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary)',
              }
            : {
                color: 'var(--text-secondary)',
              }
        }
        onMouseEnter={(e) => {
          if (!downActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-primary-soft)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--brand-primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!downActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }
        }}
        aria-label="没用"
      >
        👎 没用
      </button>
      {rating && (
        <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
          已记录到 localStorage
        </span>
      )}
    </div>
  );
}

/**
 * 评分累计统计:在 sidebar header 附近显示
 * - 已评 N 条
 * - 👍 X% / 👎 (100-X)%
 */
export function RatingsStats() {
  const [stats, setStats] = useState<{
    total: number;
    up: number;
    down: number;
  }>({ total: 0, up: 0, down: 0 });
  const [hydrated, setHydrated] = useState(false);

  function recompute() {
    const all = readRatings();
    const values = Object.values(all);
    const up = values.filter((v) => v === 'up').length;
    const down = values.filter((v) => v === 'down').length;
    setStats({ total: values.length, up, down });
  }

  /* eslint-disable react-hooks/set-state-in-effect -- mount hydration(recompute 读 localStorage)+ 订阅 cs_ratings_changed / storage 事件;recompute 必须在订阅前先调一次保证初始值 */
  useEffect(() => {
    recompute();
    setHydrated(true);
    // 监听同窗口的评分变化(自定义事件)
    const handler = () => recompute();
    window.addEventListener('cs_ratings_changed', handler);
    // 跨 tab 同步(storage event 在写入的 tab 不触发,只在其他 tab 触发)
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) recompute();
    };
    window.addEventListener('storage', storageHandler);
    return () => {
      window.removeEventListener('cs_ratings_changed', handler);
      window.removeEventListener('storage', storageHandler);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!hydrated) return null;

  const upPct = stats.total > 0 ? Math.round((stats.up / stats.total) * 100) : 0;
  const downPct = 100 - upPct;

  return (
    <div
      className="text-[11px] mt-2 px-2"
      style={{ color: 'var(--text-secondary)' }}
      title="评分累计(localStorage: cs_ratings)"
    >
      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
        评分统计
      </div>
      {stats.total === 0 ? (
        <div className="mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          暂无评分
        </div>
      ) : (
        <>
          <div className="mt-0.5">
            已评 {stats.total} 条 · 👍 {upPct}% · 👎 {downPct}%
          </div>
          <div
            className="mt-1 h-1.5 w-full rounded overflow-hidden flex"
            style={{ background: 'var(--border)' }}
          >
            <div
              className="h-full"
              style={{
                width: `${upPct}%`,
                background: 'var(--brand-primary)',
              }}
            />
            <div
              className="h-full"
              style={{
                width: `${downPct}%`,
                background: 'var(--border-strong)',
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
