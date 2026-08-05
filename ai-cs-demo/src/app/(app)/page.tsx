'use client';

/**
 * / 路由 — 占位(返回 null)
 *
 * 2026-08-04 RAGChat 提升到 (app)/layout.tsx:
 * - 原因:让 RAGChat 在 `/` 和 `/chat/[sessionId]` 之间共享同一 React instance,
 *   切 session/路由时不重 mount,useChat 状态保留,消除闪烁。
 * - 此 page.tsx 内容移到 (app)/layout.tsx,page 只为占路由存在(返回 null)。
 */
export default function Page() {
  return null;
}
