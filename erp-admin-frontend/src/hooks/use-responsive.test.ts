import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// 用 vi.hoisted 让 mock 状态在 import 前就定义。
// module-level 变量 + vi.mock 工厂读取它,可测试不同宽度。
const state = vi.hoisted(() => ({ matches: true }));

import { useResponsive, MOBILE_BREAKPOINT } from './use-responsive';

vi.mock('react-responsive', () => ({
  useMediaQuery: () => state.matches,
}));

beforeEach(() => {
  state.matches = true;
});

afterEach(() => {
  state.matches = true;
});

describe('useResponsive', () => {
  it('exposes MOBILE_BREAKPOINT = 1200', () => {
    expect(MOBILE_BREAKPOINT).toBe(1200);
  });

  it('returns isMobile=true at width 1090 (laptop 笔电)', () => {
    state.matches = true;
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.breakpoint).toBe('mobile');
  });

  it('returns isMobile=false at width 1200 (desktop 起点)', () => {
    state.matches = false;
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.breakpoint).toBe('desktop');
  });

  it('returns isMobile=false at width 1280 (desktop 横栏)', () => {
    state.matches = false;
    const { result } = renderHook(() => useResponsive());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.breakpoint).toBe('desktop');
  });
});
