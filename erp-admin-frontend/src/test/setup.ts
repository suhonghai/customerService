import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom 不实现 matchMedia,需要 mock 一下给 theme store / responsive hook / antd Grid.useBreakpoint 用
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom 不实现 ResizeObserver,antd Table / 响应式组件用它测容器尺寸。
// 给个 no-op polyfill 避免 ReferenceError,列宽逻辑走 fallback 路径即可。
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver;
  if (typeof globalThis !== 'undefined') {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
  }
}

// jsdom 不支持 getComputedStyle(伪元素) — antd Table 测量列宽/sort 图标时会调用。
// 直接给伪元素查询返回一个空 CSSStyleDeclaration,从源头消除 Not-implemented 警告
// (否则每个 cell 都打一条 stack trace,长 Table 测试会显著变慢甚至超时)。
if (typeof window !== 'undefined') {
  const origGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((elt: Element, pseudoElt?: string | null) => {
    if (pseudoElt) {
      // 伪元素查询:返回一个安全的空样式对象,所有属性读为 ''
      return {
        getPropertyValue: () => '',
      } as unknown as CSSStyleDeclaration;
    }
    return origGetComputedStyle(elt);
  }) as typeof window.getComputedStyle;
}

// 兜底抑制:即便上面 patch 漏了边界情况(比如用了全局 console.error 而不是 window.getComputedStyle),
// 也不要让 Not-implemented warning 污染 stderr / 拖慢测试。
const origConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '');
  if (
    msg.includes("Not implemented: Window's getComputedStyle()") &&
    msg.includes('pseudo-elements')
  ) {
    return;
  }
  origConsoleError(...args);
};

// 每个测试用例结束后清理 DOM,避免 RTL 跨用例状态泄漏
afterEach(() => {
  cleanup();
});
