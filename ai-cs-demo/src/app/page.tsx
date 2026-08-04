'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { RAGChat } from '@/lib/components/RAGChat';

/**
 * / 路由 — 欢迎态入口
 *
 * 2026-08-04 URL ↔ activeId 同步改造:
 * - RAGChat 搬到 lib/components/RAGChat.tsx(两侧路由复用)
 * - / 路由:无 URL sessionId,RAGChat 显示欢迎态(activeId=null,用户选/新建会话)
 * - /chat/[sessionId] 路由(app/chat/[sessionId]/page.tsx):有 sessionId,RAGChat 自动设 activeId
 * - 刷新页面:URL sessionId 持久,useParams 读 → useEffect 调 switchSession → 跳回目标会话
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
