'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { RAGChat } from '@/lib/components/RAGChat';

/**
 * (app) route group 的 layout — 渲染 RAGChat + {children}
 *
 * 2026-08-04 提升 RAGChat 原因:
 * - 之前 RAGChat 在 `app/page.tsx` 和 `app/chat/[sessionId]/page.tsx` 各自 mount,
 *   切 session 时跨 route 导致 RAGChat 整个重 mount,useChat(AI SDK)内部 state
 *   全清(messages=[])→ 拉 history 填回来 → 视觉闪烁
 * - 提到 (app)/layout.tsx 后:`/` 和 `/chat/[sessionId]` 都走这个 layout,
 *   RAGChat 在 layout 树内**只 mount 一次**(用户进 (app) group 时)→ 切 session
 *   不重 mount → useChat 状态保留 → 消除闪烁
 *
 * /login 路由在 (app)/ 之外 → 走根 `app/layout.tsx`,不挂 RAGChat 和 AuthGuard,干净
 *
 * children 是 (app) group 内的 page.tsx 渲染的内容(本场景下为空,page 只为占路由)
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RAGChat />
      {children}
    </AuthGuard>
  );
}
