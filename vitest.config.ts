import { defineConfig } from 'vitest/config';

/**
 * 根 vitest workspace:跑 tests/_specs/ 下的所有 spec。
 *
 * 设计:
 *  - include 限定 tests/_specs/ —— spec-as-code 的唯一落点
 *  - 另收 scripts/**\/*.test.ts —— SSD 工具链自身的回归测试。
 *    刻意用 .test.ts 而非 .spec.ts 后缀:spec 是业务契约,工具单测不是,两者不混。
 *    2026-08-03 审计发现 spec-audit / spec-status / check-spec-link 三个守门都曾静默空转,
 *    工具链没有测试是根因之一。
 *  - exclude `_*.spec.ts` —— 模板文件不被跑(只是参考)
 *  - 后端 spec 走 jest(看 erp-admin-backend/test/),不顺带进 vitest
 *  - 子包内单测还是各自 package.json 的 test 命令跑(避免重复配置)
 *
 * 跑法:
 *   pnpm test:spec                              # 跑所有 spec
 *   pnpm vitest run tests/_specs/<id>.spec.ts   # 跑单个(用 vitest CLI 直传 file path)
 *   pnpm vitest run -t "scenario name"          # 按 it() 标题过滤
 *
 * 关于 passWithNoTests:
 *   issue #34:之前 = true,导致 pnpm test:spec 在 0 spec 时也 exit 0,
 *   「维度 2:失败 block merge」成空话。改成 false:任何 PR 把根 spec 跑成 0
 *   都会立即 CI 变红,守门真正生效。
 *
 *   兜底:如果未来真需要临时 0 spec(比如重构期),显式改 vitest.config.ts,
 *   而不是静默放过 —— 这种 guard 必须 fail loud。
 */
export default defineConfig({
  test: {
    name: 'monorepo-specs',
    include: ['tests/_specs/**/*.spec.ts', 'scripts/**/*.test.ts'],
    // 只排模板文件;其他 _*.spec.ts 一律纳入(用户可起带 _ 的 spec 文件)
    exclude: ['**/_template.spec.ts', '**/node_modules/**'],
    environment: 'node',
    reporters: 'default',
    passWithNoTests: false, // 见上方注释 + issue #34
  },
});
