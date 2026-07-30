import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vitest 配置:复用 vite.config.ts 的 react plugin + @ alias,
// 避免 config drift(test 和 dev/build 用同一份 resolve/plugin 设定)。
//
// Coverage 阈值说明(W11 借鉴 skillhub,plan 5a352f0 P2-3):
//   - 当前实测:statements 55.39 / branches 61.4 / functions 54.17 / lines 54.68
//   - 阈值 50/55/50/50 紧贴实测,守住"不能再倒退"基线;后续随测试补充逐步上调
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
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/main.tsx',
        'src/types/',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 55,
        statements: 50,
      },
    },
  },
});
