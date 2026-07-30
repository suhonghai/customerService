import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Plus_Jakarta_Sans,
  JetBrains_Mono,
} from "next/font/google";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

/**
 * W9-UI:字体加载
 *  - Bricolage Grotesque:display(标题)
 *  - Plus Jakarta Sans:body(正文)
 *  - JetBrains Mono:mono(DEBUG 面板 / 代码 / JSON)
 * 中文 fallback 由 globals.css body { font-family } 兜(PingFang SC / 微软雅黑等)。
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "小服客服 · AI 智能购物助手",
  description: "基于 Qwen + RAG + MCP 的电商客服",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* ErrorBoundary 包整页:任何渲染时崩溃(罕见)都走友好降级 UI */}
        <ErrorBoundary>{children}</ErrorBoundary>
        {/* 全站 grain texture(opacity 0.025)— 米白背景上的有机噪点
            pointer-events: none 不挡交互,fixed inset-0 铺满视口 */}
        <div className="grain-overlay" aria-hidden="true">
          <svg width="100%" height="100%">
            <filter id="grain-filter">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                stitchTiles="stitch"
              />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain-filter)" />
          </svg>
        </div>
      </body>
    </html>
  );
}