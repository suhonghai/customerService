import { describe, expect, it } from 'vitest';
import { formatGroupTime, formatRelativeTime, getInitials, timeLabel } from './chat-format';

describe('chat-format', () => {
  describe('timeLabel', () => {
    it('formats valid ISO string to HH:mm', () => {
      expect(timeLabel('2026-06-11T09:05:00Z')).toMatch(/^\d{2}:\d{2}$/);
    });
    it('returns empty string for null/undefined/empty', () => {
      expect(timeLabel('')).toBe('');
      expect(timeLabel(null)).toBe('');
      expect(timeLabel(undefined)).toBe('');
    });
    it('returns empty string for invalid date string', () => {
      expect(timeLabel('not-a-date')).toBe('');
    });
  });

  describe('formatGroupTime', () => {
    it('returns HH:mm for same day as now', () => {
      const now = new Date('2026-06-11T10:00:00');
      const ts = '2026-06-11T09:00:00';
      expect(formatGroupTime(ts, now)).toMatch(/^\d{2}:\d{2}$/);
    });
    it('returns MM-DD HH:mm for different day', () => {
      const now = new Date('2026-06-11T10:00:00');
      const ts = '2026-06-10T09:00:00';
      // 跨天:locale string 包含 "06-10" + 时间
      expect(formatGroupTime(ts, now)).toMatch(/06\/10/);
    });
    it('returns empty for invalid input', () => {
      expect(formatGroupTime('garbage')).toBe('');
    });
  });

  describe('formatRelativeTime', () => {
    const now = new Date('2026-06-11T10:00:00');
    it('returns "刚刚" for < 1 min', () => {
      expect(formatRelativeTime('2026-06-11T09:59:30', now)).toBe('刚刚');
    });
    it('returns "N 分钟前" for 1-59 min', () => {
      expect(formatRelativeTime('2026-06-11T09:55:00', now)).toBe('5 分钟前');
    });
    it('returns "N 小时前" for 1-23 hours', () => {
      expect(formatRelativeTime('2026-06-11T07:00:00', now)).toBe('3 小时前');
    });
    it('returns "昨天" for yesterday same time', () => {
      expect(formatRelativeTime('2026-06-10T10:00:00', now)).toBe('昨天');
    });
    it('returns MM-DD for older same-year', () => {
      expect(formatRelativeTime('2026-05-20T10:00:00', now)).toMatch(/05\/20/);
    });
    it('returns YYYY-MM-DD for cross-year', () => {
      expect(formatRelativeTime('2025-12-20T10:00:00', now)).toMatch(/2025/);
    });
  });

  describe('getInitials', () => {
    it('takes first 2 chars upper-cased', () => {
      expect(getInitials('visitor123')).toBe('VI');
      expect(getInitials('小米')).toBe('小米'.slice(0, 2).toUpperCase());
    });
    it('falls back to default char when empty/null', () => {
      expect(getInitials('')).toBe('?');
      expect(getInitials(null)).toBe('?');
      expect(getInitials(undefined)).toBe('?');
      expect(getInitials('  ')).toBe('?');
    });
    it('uses custom fallback', () => {
      expect(getInitials('', '访')).toBe('访');
    });
  });
});
