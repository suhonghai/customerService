// ai-cs-demo 全局类型 —— 把 jest-dom matcher 类型注入 vitest 的 expect / jest。
//
// Why: setup.ts 已经 `expect.extend(matchers)`(fix-007 引入)注册了 matcher 实现,
// 但 TypeScript 不知道,所以 .test.tsx 里 .toBeInTheDocument() 等报错。
// `@testing-library/jest-dom` 的 types 子路径提供 declare global,引入即生效。
//
// 参考:https://github.com/testing-library/jest-dom#with-typescript
import '@testing-library/jest-dom';