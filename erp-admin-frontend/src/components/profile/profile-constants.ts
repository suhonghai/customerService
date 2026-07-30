/**
 * Profile 业务常量 — 密码校验规则
 *
 * 与 page 层 form validator 一致:
 *   - 旧密码必填,至少 6 位
 *   - 新密码必填,长度 6-50
 *   - 两次输入必须一致
 *   - 新密码不能与旧密码相同
 */
export const PASSWORD_RULES = {
  MIN: 6,
  MAX: 50,
} as const;
