import {
  RATING_COLOR_THRESHOLDS,
  RATING_TAG_COLOR,
  HIT_RATE_THRESHOLDS,
  HIT_RATE_BAR_COLOR,
} from './stats-constants';

/**
 * 0~1 比例 → 百分比字符串(保留 1 位小数)。
 *
 * @example pct(0.876) === '87.6%'
 */
export function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/**
 * 平均评分 → antd Tag color('green' | 'gold' | 'red')。
 * 边界:
 *   v >= 4 → green
 *   v >= 3 → gold
 *   else   → red
 */
export function ratingTagColor(v: number): 'green' | 'gold' | 'red' {
  if (v >= RATING_COLOR_THRESHOLDS.GOOD) return RATING_TAG_COLOR.green;
  if (v >= RATING_COLOR_THRESHOLDS.OK) return RATING_TAG_COLOR.gold;
  return RATING_TAG_COLOR.red;
}

/**
 * AiHitRate (0~1) → Progress status。
 *   v >= 0.7 → success
 *   v >= 0.4 → normal
 *   else     → exception
 */
export function hitRateStatus(v: number): 'success' | 'normal' | 'exception' {
  if (v >= HIT_RATE_THRESHOLDS.GOOD) return 'success';
  if (v >= HIT_RATE_THRESHOLDS.OK) return 'normal';
  return 'exception';
}

/**
 * AiHitRate 百分比(0~100) → 柱图配色。
 * 与 hitRateStatus 阈值一致:>= 70 绿 / >= 40 金 / else 红。
 */
export function hitRateBarColor(pct100: number): string {
  if (pct100 >= HIT_RATE_THRESHOLDS.GOOD * 100) return HIT_RATE_BAR_COLOR.GOOD;
  if (pct100 >= HIT_RATE_THRESHOLDS.OK * 100) return HIT_RATE_BAR_COLOR.OK;
  return HIT_RATE_BAR_COLOR.BAD;
}
