'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { RAGChat } from '@/lib/components/RAGChat';

/**
 * /chat/[sessionId] 路由 — 会话详情页
 *
 * RAGChat 内部:
 * - useParams() 读 urlSessionId
 * - useEffect:urlSessionId 变 → 调 switchSession(urlSessionId) → setActiveId → 拉 history
 * - handleSwitchSession / handleCreateSession / handleDeleteSession 调 router.replace 同步 URL
 *
 * 刷新页面:
 * - /chat/abc123 → useParams 读 { sessionId: 'abc123' } → useEffect 调 switchSession
 * - 用户停留在第 2 个会话(不再"刷新跳到第 1 个")
 *
 * V1 S5:把主对话页包到 AuthGuard 里 — 未登录自动跳 /login。
 */
export default function Page() {
  return (
    <AuthGuard>
      <RAGChat />
    </AuthGuard>
  );
}
