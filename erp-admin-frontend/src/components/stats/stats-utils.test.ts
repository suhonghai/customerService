import { describe, it, expect } from 'vitest';
import { pct, ratingTagColor, hitRateStatus, hitRateBarColor } from './stats-utils';

describe('pct', () => {
  it('formats 0.5 as 50.0%', () => {
    expect(pct(0.5)).toBe('50.0%');
  });

  it('rounds to 1 decimal', () => {
    expect(pct(0.876)).toBe('87.6%');
    expect(pct(0.12345)).toBe('12.3%');
  });

  it('keeps 0 exactly as 0.0%', () => {
    expect(pct(0)).toBe('0.0%');
  });

  it('rounds to 100.0% for value >= 1', () => {
    expect(pct(1)).toBe('100.0%');
    expect(pct(1.5)).toBe('150.0%');
  });
});

describe('ratingTagColor', () => {
  it('returns green for >= 4', () => {
    expect(ratingTagColor(4)).toBe('green');
    expect(ratingTagColor(4.5)).toBe('green');
    expect(ratingTagColor(5)).toBe('green');
  });

  it('returns gold for >= 3 and < 4', () => {
    expect(ratingTagColor(3)).toBe('gold');
    expect(ratingTagColor(3.5)).toBe('gold');
    expect(ratingTagColor(3.99)).toBe('gold');
  });

  it('returns red for < 3', () => {
    expect(ratingTagColor(2.99)).toBe('red');
    expect(ratingTagColor(0)).toBe('red');
    expect(ratingTagColor(-1)).toBe('red');
  });
});

describe('hitRateStatus', () => {
  it('returns success for >= 0.7', () => {
    expect(hitRateStatus(0.7)).toBe('success');
    expect(hitRateStatus(0.9)).toBe('success');
    expect(hitRateStatus(1)).toBe('success');
  });

  it('returns normal for >= 0.4 and < 0.7', () => {
    expect(hitRateStatus(0.4)).toBe('normal');
    expect(hitRateStatus(0.5)).toBe('normal');
    expect(hitRateStatus(0.69)).toBe('normal');
  });

  it('returns exception for < 0.4', () => {
    expect(hitRateStatus(0.39)).toBe('exception');
    expect(hitRateStatus(0)).toBe('exception');
  });
});

describe('hitRateBarColor', () => {
  it('returns green hex for >= 70', () => {
    expect(hitRateBarColor(70)).toBe('#52c41a');
    expect(hitRateBarColor(95)).toBe('#52c41a');
  });

  it('returns gold hex for >= 40 and < 70', () => {
    expect(hitRateBarColor(40)).toBe('#faad14');
    expect(hitRateBarColor(69.99)).toBe('#faad14');
  });

  it('returns red hex for < 40', () => {
    expect(hitRateBarColor(39.99)).toBe('#ff4d4f');
    expect(hitRateBarColor(0)).toBe('#ff4d4f');
  });
});
