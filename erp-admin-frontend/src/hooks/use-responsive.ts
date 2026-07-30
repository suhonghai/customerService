import { useMediaQuery } from 'react-responsive';

// 笔电(≤1200)统一进 mobile drawer,desktop 横栏从 1200+ 起用
export const MOBILE_BREAKPOINT = 1200;

export interface ResponsiveState {
  isMobile: boolean;
  breakpoint: 'mobile' | 'desktop';
}

/**
 * 响应式判断 hook:基于 MOBILE_BREAKPOINT (1200) 返回 { isMobile, breakpoint }。
 *
 * 复用 react-responsive 的 useMediaQuery,SSR/测试 mock 走 maxWidth 配置。
 */
export function useResponsive(): ResponsiveState {
  const isMobile = useMediaQuery({ maxWidth: MOBILE_BREAKPOINT - 1 });
  return {
    isMobile,
    breakpoint: isMobile ? 'mobile' : 'desktop',
  };
}
