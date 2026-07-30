/**
 * JWT 配置常量(从 .env 读,启动期就绪)
 *
 * 严禁硬编码:
 * - JWT_SECRET 至少 32 字符
 * - JWT_REFRESH_SECRET 至少 32 字符
 * - JWT_EXPIRES_IN 单位秒(默认 7200 = 2h)
 * - JWT_REFRESH_EXPIRES_IN 单位秒(默认 604800 = 7d)
 */

export const ACCESS_TOKEN_TTL_SEC = Number(process.env.JWT_EXPIRES_IN ?? 7200);
export const REFRESH_TOKEN_TTL_SEC = Number(process.env.JWT_REFRESH_EXPIRES_IN ?? 604800);

export const JWT_SECRET = process.env.JWT_SECRET ?? '';
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? '';

/**
 * 登录失败锁定策略(Day 2 简化版,纯 MySQL 方案,见 04-rbac-model.md 8.3)
 */
export const LOGIN_LOCK = {
  MAX_FAILS: 5,
  LOCK_DURATION_MS: 15 * 60 * 1000, // 15 分钟
} as const;

/**
 * 密码哈希 cost(bcrypt 12 业界标准)
 */
export const BCRYPT_COST = 12;
