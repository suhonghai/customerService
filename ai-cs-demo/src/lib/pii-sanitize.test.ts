/**
 * @status implemented
 * @change-id cs-round-004
 *
 * cs-round-004:PII 脱敏(单元测试,纯函数)
 */

import { describe, it, expect } from 'vitest';
import { sanitizeTitle } from './pii-sanitize';

describe('cs-round-004: pii-sanitize', () => {
  describe('Given: 含结构化 PII 的输入', () => {
    it('Then: 手机号 → [手机号]', () => {
      expect(sanitizeTitle('我的手机是 13800138000')).toBe('我的手机是 [手机号]');
    });

    it('Then: 身份证 → [身份证号]', () => {
      expect(sanitizeTitle('身份证 110101199001011234')).toBe('身份证 [身份证号]');
    });

    it('Then: 邮箱 → [邮箱]', () => {
      expect(sanitizeTitle('邮箱 a@b.com 收到请回复')).toBe('邮箱 [邮箱] 收到请回复');
    });

    it('Then: 16-19 位连续数字 → [银行卡号]', () => {
      expect(sanitizeTitle('卡号 6222021234567890123')).toBe('卡号 [银行卡号]');
    });
  });

  describe('Given: 普通文本', () => {
    it('Then: 不变', () => {
      expect(sanitizeTitle('客服你好我想问订单问题')).toBe('客服你好我想问订单问题');
    });

    it('Then: 折叠空白 + trim', () => {
      expect(sanitizeTitle('  多余   空白  ')).toBe('多余 空白');
    });

    it('Then: 截到 200 字', () => {
      const long = 'a'.repeat(500);
      const out = sanitizeTitle(long);
      expect(out.length).toBe(200);
    });
  });

  describe('Given: 多个 PII 混合', () => {
    it('Then: 全替换', () => {
      const raw = '我的卡 6222021234567890123 手机 13800138000 邮箱 x@y.com';
      const out = sanitizeTitle(raw);
      expect(out).not.toContain('6222021234567890123');
      expect(out).not.toContain('13800138000');
      expect(out).not.toContain('x@y.com');
      expect(out).toContain('[银行卡号]');
      expect(out).toContain('[手机号]');
      expect(out).toContain('[邮箱]');
    });
  });
});
