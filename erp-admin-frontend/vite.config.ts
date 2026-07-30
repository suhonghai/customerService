import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
// 函数式 config:支持 --mode 区分环境(development / test / uat / production)
// loadEnv 会加载 .env.{mode} + .env,所有变量(空 prefix → 不过滤)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [
      react(),
      // Bundle 可视化:pnpm build 后生成 dist/stats.html
      // (gzip 后体积、模块占比、依赖关系一目了然)
      visualizer({
        filename: 'dist/stats.html',
        open: false,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap', // 'sunburst' | 'treemap' | 'network'
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      // 生产环境关闭 sourcemap(减小 dist 体积),其他环境保留便于调试
      sourcemap: mode !== 'production',
      // bundle 拆分:把大依赖拆成 vendor chunk,提升首屏加载和缓存命中率
      // 用函数式 manualChunks(Vite 8 / Rollup 4 新签名,键值映射在 d.ts 不再支持)
      rollupOptions: {
        output: {
          manualChunks(id: string): string | undefined {
            if (!id.includes('node_modules')) return undefined;
            // react / react-dom / react-router-dom → react-vendor
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor';
            }
            // antd + icons + charts + rc-* → antd-vendor
            if (
              id.includes('/antd/') ||
              id.includes('/@ant-design/') ||
              id.includes('/rc-')
            ) {
              return 'antd-vendor';
            }
            // @tanstack/react-query + zustand → query-vendor
            if (
              id.includes('/@tanstack/') ||
              id.includes('/zustand/')
            ) {
              return 'query-vendor';
            }
            return undefined;
          },
        },
      },
      // 单 chunk 警告阈值 1000KB(原 500 太紧,允许业务 chunk 放宽)
      chunkSizeWarningLimit: 1000,
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    // build 时注入:运行时可通过 __APP_ENV__ 判断当前 mode
    define: {
      __APP_ENV__: JSON.stringify(mode),
    },
  };
});