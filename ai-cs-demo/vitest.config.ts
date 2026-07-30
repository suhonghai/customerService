import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest 配置:复用 vite.config.ts 的 react plugin + @ alias,
// 避免 config drift(test 和 dev/build 用同一份 resolve/plugin 设定)。
//
// Coverage 阈值说明(W11 借鉴 skillhub,plan 5a352f0 P2-3 + 本地 S5 fc87eea):
//   - include 限定在单测覆盖域:lib / hooks / components/chat;Next.js app/api
//     路由与 storage 留给 e2e / 集成测试(那部分覆盖率不由本 gate 守)
//   - 当前实测基线(S5 commit 时实测):
//       lines 9.58 / branches 10.94 / functions 11.82 / statements 9.15
//   - 阈值 10/10/10/10 紧贴实测,守住"不能再倒退"基线
//   - TODO:补 storage / agent/tools / ai.ts / env.ts 单测后上调阈值
//   - 排除:测试基建、入口、类型定义、.d.ts、测试文件本身
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/components/chat/**/*.{ts,tsx}',
        'scripts/mcp-servers/**/*.{ts,tsx}',
      ],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'next-env.d.ts',
        'src/types/',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },
  },
});