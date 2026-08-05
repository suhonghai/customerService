'use client';

/**
 * /chat/[sessionId] 路由 — 占位(返回 null)
 *
 * 2026-08-04 RAGChat 提升到 (app)/layout.tsx(同 (app)/page.tsx 注释):
 * - 此 page.tsx 内容移到 layout.tsx,page 只为占路由存在(返回 null)。
 * - 路由仍响应 /chat/[sessionId] 路径,但实际内容由 (app)/layout.tsx 内的 RAGChat 渲染。
 * - RAGChat 跨 (app) group 内所有 route 共享同一 React instance,切 session 不重 mount,消除闪烁。
 */
export default function Page() {
  return null;
}
