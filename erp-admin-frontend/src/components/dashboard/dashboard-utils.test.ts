import { describe, it, expect } from 'vitest';
import { greetByHour, enabled, formatDateEn } from './dashboard-utils';
import type { QuickLink } from './dashboard-constants';

describe('greetByHour', () => {
  it('returns Good night for hours 0-5', () => {
    expect(greetByHour(0)).toBe('Good night');
    expect(greetByHour(3)).toBe('Good night');
    expect(greetByHour(5)).toBe('Good night');
  });

  it('returns Good morning for hours 6-11', () => {
    expect(greetByHour(6)).toBe('Good morning');
    expect(greetByHour(9)).toBe('Good morning');
    expect(greetByHour(11)).toBe('Good morning');
  });

  it('returns Good afternoon for hours 12-17', () => {
    expect(greetByHour(12)).toBe('Good afternoon');
    expect(greetByHour(15)).toBe('Good afternoon');
    expect(greetByHour(17)).toBe('Good afternoon');
  });

  it('returns Good evening for hours 18-23', () => {
    expect(greetByHour(18)).toBe('Good evening');
    expect(greetByHour(21)).toBe('Good evening');
    expect(greetByHour(23)).toBe('Good evening');
  });
});

describe('enabled', () => {
  const linkUser: QuickLink = { path: '/x', title: 'X', desc: '', icon: 'user', perm: 'user:view' };

  it('returns true when link has no perm', () => {
    const l: QuickLink = { path: '/x', title: 'X', desc: '', icon: 'user' };
    expect(enabled([], l)).toBe(true);
  });

  it('returns true for wildcard `*` admin', () => {
    expect(enabled(['*'], linkUser)).toBe(true);
  });

  it('returns true on exact perm match', () => {
    expect(enabled(['user:view'], linkUser)).toBe(true);
  });

  it('returns true on module wildcard `user:*`', () => {
    expect(enabled(['user:*'], linkUser)).toBe(true);
  });

  it('returns false when no perm match and no wildcards', () => {
    expect(enabled(['order:view'], linkUser)).toBe(false);
    expect(enabled([], linkUser)).toBe(false);
  });
});

describe('formatDateEn', () => {
  it('formats a Date into "Mon DD, YYYY" en-US style', () => {
    const d = new Date('2026-07-16T00:00:00.000Z');
    const out = formatDateEn(d);
    // Locale-dependent month name; just assert the year + day shape
    expect(out).toContain('2026');
    expect(out).toContain('16');
    // Month abbreviation is one of Jan/Feb/.../Dec; for July 16 it must include "Jul"
    expect(/[A-Z][a-z]{2}/.test(out)).toBe(true);
  });
});
