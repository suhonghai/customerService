/**
 * pii-sanitize — 敏感信息脱敏(2026-07-31 cs-round-004)
 *
 * 用法:
 *   const safe = sanitizeTitle(rawUserInput);
 *
 * 设计:浅层正则覆盖结构化 PII(身份证 / 手机 / 银行卡 / 邮箱),不匹配普通词。
 * 不做语义理解(NLP),不处理非结构化个人信息(地址 / 姓名)。
 * 边界:有误伤风险(把 18 位数字当身份证),可接受 —— 写会话标题不是关键场景。
 */

const PII_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  // 身份证号(15 位旧 / 18 位新,含 X 校验位)
  { re: /\b\d{17}[\dXx]\b/g, replacement: '[身份证号]' },
  { re: /\b\d{15}\b/g, replacement: '[身份证号]' },
  // 手机号
  { re: /\b1[3-9]\d{9}\b/g, replacement: '[手机号]' },
  // 银行卡号(13-19 位连续数字,简化判断)
  { re: /\b\d{16,19}\b/g, replacement: '[银行卡号]' },
  // 邮箱
  { re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, replacement: '[邮箱]' },
];

/**
 * 把输入里的结构化 PII 替换为占位符,返回 sanitize 后的字符串。
 * - 长度限制 200 字(与 schema title 字段对齐)
 * - 空白折叠 + trim
 */
export function sanitizeTitle(raw: string): string {
  let s = raw;
  for (const { re, replacement } of PII_PATTERNS) {
    s = s.replace(re, replacement);
  }
  return s.trim().replace(/\s+/g, ' ').slice(0, 200);
}
