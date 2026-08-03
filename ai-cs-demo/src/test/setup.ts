/**
 * Vitest 全局 setup:注册 @testing-library/jest-dom matchers + React cleanup。
 *
 * Why 显式 expect.extend(matchers):
 *   - `@testing-library/jest-dom/vitest` 是个 side-effect import,内部自动 extend。
 *     在 GitHub Actions 的 runner image 上,Vite configLoader 走非 native 路径
 *     (CI 输出 warning: "ESM syntax in a file loaded as CommonJS"),
 *     side-effect 注册会在某些 worker 上丢失,导致 .tsx 组件测试报
 *     "Invalid Chai property: toBeInTheDocument" 这种错。
 *   - 本地 node 22 + vite native loader 表现正常,所以本地跑全过,CI 跑全挂。
 *   - 显式 expect.extend(matchers) 不依赖任何隐式注册时机,在所有 worker / loader
 *     下都稳定。
 *   - 参考:https://github.com/testing-library/jest-dom#with-vitest
 */
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

afterEach(() => {
  cleanup();
});