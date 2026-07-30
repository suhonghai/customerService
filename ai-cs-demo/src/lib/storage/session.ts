import { getErpAdminClient, type SessionInfo } from '../erp-admin-client';
import { isTest } from '../env';

/**
 * session 存储抽象(Day 9)
 *
 * 原架构:用 localStorage 在前端 hook 层管理(use-sessions.ts)
 *   - UI 缓存 / 离线兜底,合理
 *   - 但**真实数据**没进 erp-admin,后端查不到
 *
 * 新架构:localStorage 仍保留作 UI 缓存
 *         服务端每次对话/消息后**异步**同步到 erp-admin
 *         这样 erp-admin 看板 / stats 拿得到数据
 *
 * 失败策略:
 *   - erp-admin 不可达:warn + 继续(不影响聊天)
 *   - 成功:返回 server session
 */

export interface UpsertSessionInput {
  sessionKey: string;
  visitorId: string;
  visitorName?: string;
  /** V1 S7:首问派生后的 title,后端 internal.service 会覆盖 visitorName */
  title?: string;
  channel?: number;
  aiModelCode?: string;
}

/**
 * upsert 会话,返回 erp-admin 的 SessionInfo
 * 失败抛 — 调用方决定是否兜底
 */
export async function upsertSession(input: UpsertSessionInput): Promise<SessionInfo> {
  const client = getErpAdminClient();
  return client.upsertSession(input);
}

export interface AppendMessageInput {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: unknown;
  metadata?: unknown;
  status?: number;
}

/**
 * 追加消息到 erp-admin
 * 失败抛 — 调用方决定
 */
export async function appendMessage(
  sessionId: number,
  msg: AppendMessageInput,
): Promise<{ id: number }> {
  const client = getErpAdminClient();
  return client.appendMessage(sessionId, msg);
}

/**
 * 兜底版:失败不抛,只 warn
 * 适合 chat route 在 finally 里调用,不影响主链路
 */
export async function upsertSessionSafe(input: UpsertSessionInput): Promise<SessionInfo | null> {
  try {
    return await upsertSession(input);
  } catch (e) {
    if (!isTest) {
      console.warn(`[storage/session] upsertSession 失败,降级(不阻断): ${(e as Error).message}`);
    }
    return null;
  }
}

export async function appendMessageSafe(sessionId: number, msg: AppendMessageInput): Promise<void> {
  try {
    await appendMessage(sessionId, msg);
  } catch (e) {
    if (!isTest) {
      console.warn(`[storage/session] appendMessage 失败,降级(不阻断): ${(e as Error).message}`);
    }
  }
}
