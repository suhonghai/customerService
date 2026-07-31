import { defineConfig } from 'vitest/config';

/**
 * 根 vitest workspace:跑 tests/_specs/ 下的所有 spec。
 *
 * 设计:
 *  - include 限定 tests/_specs/ —— spec-as-code 的唯一落点
 *  - exclude `_*.spec.ts` —— 模板文件不被跑(只是参考)
 *  - 后端 spec 走 jest(看 erp-admin-backend/test/),不顺带进 vitest
 *  - 子包内单测还是各自 package.json 的 test 命令跑(避免重复配置)
 *
 * 跑法:
 *   pnpm test:spec                              # 跑所有 spec
 *   pnpm vitest run tests/_specs/<id>.spec.ts   # 跑单个(用 vitest CLI 直传 file path)
 *   pnpm vitest run -t "scenario name"          # 按 it() 标题过滤
 */
export default defineConfig({
  test: {
    name: 'monorepo-specs',
    include: ['tests/_specs/**/*.spec.ts'],
    // 只排模板文件;其他 _*.spec.ts 一律纳入(用户可起带 _ 的 spec 文件)
    exclude: ['**/_template.spec.ts', '**/node_modules/**'],
    environment: 'node',
    reporters: 'default',
    passWithNoTests: true, // 还没 spec 写时跑过 CI 不算失败
  },
});
