/**
 * CsAuth 模块配置常量
 *
 * - CS_TOKEN_TTL_SEC:7d(604800s),前台用户体验期长,运维简化
 * - JWT_SECRET:复用 auth 模块的同一 secret,但通过 payload.type='cs_customer' 与
 *   内部 access token 隔离(同一 secret 不会冲突,因为 type 校验在 verify 阶段)
 * - CS_ACCESS_TOKEN_COOKIE:与现有 `access_token` cookie 完全不重名,避免互相覆盖
 */

export const CS_TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7d

export const JWT_SECRET = process.env.JWT_SECRET ?? '';

export const CS_ACCESS_TOKEN_COOKIE = 'cs_access_token';
