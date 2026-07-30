import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RatingTag, fmtDate } from './session-utils.tsx';

describe('RatingTag', () => {
  it('renders N/A when value is null', () => {
    render(<RatingTag value={null} />);
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('renders N/A when value is undefined', () => {
    render(<RatingTag value={undefined} />);
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('renders Good for value >= 4', () => {
    render(<RatingTag value={5} />);
    expect(screen.getByText('Good')).toBeTruthy();
  });

  it('renders OK for value >= 3 and < 4', () => {
    render(<RatingTag value={3} />);
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('renders Bad for value < 3', () => {
    render(<RatingTag value={1} />);
    expect(screen.getByText('Bad')).toBeTruthy();
  });
});

describe('fmtDate', () => {
  it('returns "-" for null', () => {
    expect(fmtDate(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(fmtDate(undefined)).toBe('-');
  });

  it('returns "-" for empty string', () => {
    expect(fmtDate('')).toBe('-');
  });

  it('returns localized string for valid date', () => {
    const out = fmtDate('2026-01-15T10:00:00.000Z');
    expect(out).not.toBe('-');
    expect(out.length).toBeGreaterThan(0);
  });
});
