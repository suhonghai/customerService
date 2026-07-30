import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import './index.css';
import App from './App';
import { useThemeStore, setupThemeListener } from './stores/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Editorial Magazine 主题 token:
 * - 主色暖靛蓝 #3949ab(克制专业,不是 Element Plus 浅蓝)
 * - Fraunces 衬线 display + Inter body + JetBrains Mono 数据
 * - 圆角克制 4-6
 * - 接近无阴影,outline-like 分层
 */
function ThemeRoot({ children }: { children: React.ReactNode }) {
  const effective = useThemeStore((s) => s.effective);

  const themeConfig = {
    algorithm: effective === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#3949ab',
      colorInfo: '#737373',
      colorSuccess: '#059669',
      colorWarning: '#d97706',
      colorError: '#b91c1c',
      colorLink: '#3949ab',
      colorBgBase: effective === 'dark' ? '#0f0f0f' : '#faf8f3',
      colorTextBase: effective === 'dark' ? '#fafaf9' : '#1a1a1a',
      borderRadius: 4,
      borderRadiusLG: 6,
      borderRadiusSM: 3,
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
      fontSize: 14,
      fontSizeLG: 16,
      fontSizeXL: 18,
      fontSizeHeading1: 32,
      fontSizeHeading2: 24,
      fontSizeHeading3: 20,
      fontSizeHeading4: 18,
      fontSizeHeading5: 16,
      lineHeight: 1.55,
      wireframe: false,
      motionDurationMid: '0.24s',
      motionEaseOut: 'cubic-bezier(0.2, 0.6, 0.2, 1)',
    },
    components: {
      Layout: {
        siderBg: effective === 'dark' ? '#171717' : '#ffffff',
        headerBg: effective === 'dark' ? '#171717' : '#ffffff',
        bodyBg: 'transparent',
        headerHeight: 60,
        headerPadding: '0 32px',
        siderWidth: 232,
      },
      Menu: {
        itemBg: 'transparent',
        subMenuItemBg: 'transparent',
        itemSelectedBg: 'transparent',
        itemHoverBg: '#faf8f3',
        itemBorderRadius: 4,
        itemMarginInline: 16,
        itemHeight: 36,
        iconSize: 15,
      },
      Card: {
        borderRadiusLG: 6,
        paddingLG: 28,
      },
      Table: {
        headerBg: 'transparent',
        headerSplitColor: '#e8e3d2',
        headerColor: effective === 'dark' ? '#a3a3a3' : '#737373',
        rowHoverBg: effective === 'dark' ? '#1f1f1f' : '#faf8f3',
        cellPaddingBlock: 18,
        cellPaddingInline: 20,
        borderColor: 'transparent',
      },
      Button: {
        borderRadius: 4,
        controlHeight: 34,
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
      },
      Input: {
        borderRadius: 4,
        controlHeight: 34,
      },
      Select: {
        borderRadius: 4,
        controlHeight: 34,
      },
      Tag: {
        borderRadiusSM: 999,
      },
      Modal: {
        borderRadiusLG: 8,
      },
    },
  };

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

setupThemeListener();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeRoot>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeRoot>
    </QueryClientProvider>
  </React.StrictMode>,
);
