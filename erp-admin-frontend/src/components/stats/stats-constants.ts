/**
 * Stats page 共享常量。
 *
 * Rating → Tag 颜色阈值:与原 Stats/index.tsx AgentPerformance 列渲染一致。
 *   avgRating >= 4  绿
 *   avgRating >= 3  金
 *   else            红
 */
export const RATING_COLOR_THRESHOLDS = {
  /** >= 4 → green */
  GOOD: 4,
  /** >= 3 → gold */
  OK: 3,
} as const;

/** Rating 对应的 antd Tag 颜色 key */
export const RATING_TAG_COLOR = {
  green: 'green',
  gold: 'gold',
  red: 'red',
} as const;

/** AiHitRate Progress status 阈值:与原 AiHitRateTab 一致 */
export const HIT_RATE_THRESHOLDS = {
  /** >= 0.7 → success */
  GOOD: 0.7,
  /** >= 0.4 → normal */
  OK: 0.4,
} as const;

/** AiHitRate Progress 颜色映射(用于 Column chart label 配色,与阈值同步) */
export const HIT_RATE_BAR_COLOR = {
  GOOD: '#52c41a',
  OK: '#faad14',
  BAD: '#ff4d4f',
} as const;
