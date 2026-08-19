'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';

/**
 * cs-round-011:useAutoResumeStreaming — 监听 messages 列表里 metadata.isStreaming
 * 的项,对每条触发一次 fetch('/api/chat') 带 continueFromMessageId,然后消费
 * SSE 流,parse 出 UI Message Stream chunks(text-delta 等),把新 text
 * append 到 useChat 的 messages 里 id=continueFromMessageId 那条上。
 *
 * cs-round-062:触发条件从「只认 isStreaming」扩展为「isStreaming OR isError」
 * — DB status=4(content 空,AI 写一半异常中断)的消息也能触发续推。修前
 * status=4 → 前端 storedToUIMessages 不标 isStreaming → 钩子跳过 → 用户
 * 刷新进来看到空气泡。后端 chat/route.ts:550-555 一直允许续推 status=4,
 * 本次只是补齐前端触发条件。
 *
 * 与 useChat 默认 transport 互不干扰:
 *  - 自动续推走 manual fetch + setMessages,绕开 useChat 的 sendMessage。
 *  - 用户主动发新消息 / 点「重新生成」时,useChat 的 messages 里有 update 触发,
 *    自动续推逻辑在同一消息上 append 内容,不冲突。
 *
 * failure 兜底:
 *  - fetch 失败 / 流解析异常 → 自动重试 1 次(2s 后),再失败 → 标 isError
 *    metadata,前端显示「重新生成」按钮。
 *
 * 完成后,清掉那条 message 的 isStreaming 标记,让 UI 回到正常状态。
 */
interface UseAutoResumeOptions {
  messages: UIMessage[];
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void;
  sessionKey: string | null;
  visitorId: string;
  userId: number | null;
  customerId: number | null;
  topK?: number;
}

interface StreamingMsgMeta {
  isStreaming?: boolean;
  isError?: boolean;
  isInterrupted?: boolean;
  continueFromMessageId?: number;
  [key: string]: unknown;
}

export function useAutoResumeStreaming({
  messages,
  setMessages,
  sessionKey,
  visitorId,
  userId,
  customerId,
  topK = 3,
}: UseAutoResumeOptions): void {
  // 已触发 resume 的 message id 集合,防 effect 重跑重复触发
  const resumedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionKey) return;
    for (const m of messages) {
      if (!m || m.role !== 'assistant') continue;
      const meta = (m.metadata as unknown as StreamingMsgMeta) || {};
      // cs-round-062:isStreaming OR isError 都触发续推 — DB status=4(content 空)
      // 也能恢复。后端 chat/route.ts 续推分支允许 status ∈ {2, 4}。
      // status=3 (aborted) 不在此处触发,storedToUIMessages 没标 isError 也没 isStreaming。
      if (!meta.isStreaming && !meta.isError) continue;
      if (!meta.continueFromMessageId) continue;
      if (resumedRef.current.has(m.id)) continue;
      // 触发
      resumedRef.current.add(m.id);
      void resumeOne({
        messageId: m.id,
        continueFromMessageId: meta.continueFromMessageId,
        sessionKey,
        visitorId,
        userId,
        customerId,
        topK,
        setMessages,
      });
    }
  }, [messages, sessionKey, visitorId, userId, customerId, topK, setMessages]);
}

/**
 * cs-round-027:SSE chunk parser —— 把 raw stream text 拆成 UI Message Stream chunks。
 *
 * 标准 SSE 格式(AI SDK 6.x createUIMessageStreamResponse 输出):
 *   data: <json>\n\n
 *   data: <json>\n\n
 *   ...
 *
 * 拆 event(\n\n 分隔)→ 剥 `data: ` 前缀 → JSON.parse → 返回 chunk 数组。
 *
 * 入参 `buffer` 是上次的残余(网络 read 可能切在 event 中间),保留到下次继续拆。
 *
 * 出参 `{ events, rest }`:events 是这次完整拆出的 chunks(JSON 解析成功),
 * rest 是没拆完的残余(下次调用时拼到新 buffer 头部)。
 *
 * 异常:JSON.parse 失败的 event 静默丢弃(同之前 catch 行为)+ warn。
 *   不抛错,保持 resumeOne 的 retry 路径。
 */
export function parseSseEvents(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  // 按双换行拆 SSE event;最后一段可能不完整,留到下次
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    if (!part.trim()) continue;
    const dataLines = part.split('\n').filter((l) => l.startsWith('data:'));
    if (dataLines.length === 0) continue;
    // 多行 data: → 多行 JSON 拼接(SSE multi-line data 规范)
    const json = dataLines.map((l) => l.slice(5).trimStart()).join('');
    if (!json) continue;
    try {
      events.push(JSON.parse(json));
    } catch (e) {
      console.warn(
        '[auto-resume] parse chunk failed:',
        (e as Error).message,
        'json:',
        json.slice(0, 120),
      );
    }
  }
  return { events, rest };
}

async function resumeOne(args: {
  messageId: string;
  continueFromMessageId: number;
  sessionKey: string;
  visitorId: string;
  userId: number | null;
  customerId: number | null;
  topK: number;
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void;
}): Promise<void> {
  const {
    messageId,
    continueFromMessageId,
    sessionKey,
    visitorId,
    userId,
    customerId,
    topK,
    setMessages,
  } = args;
  let retries = 0;
  const attemptOnce = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': '' },
        body: JSON.stringify({
          messages: [
            {
              id: `m_continue_${continueFromMessageId}`,
              role: 'user',
              parts: [{ type: 'text', text: '' }],
            },
          ],
          sessionKey,
          visitorId,
          userId,
          customerId,
          topK,
          continueFromMessageId,
        }),
      });
      if (!res.ok || !res.body) {
        console.warn(
          `[auto-resume] fetch failed status=${res.status} messageId=${messageId}`,
        );
        return false;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // cs-round-027:用 parseSseEvents 拆 SSE event(\n\n 分隔)→ 剥 data: 前缀 → JSON.parse
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseEvents(buffer);
        buffer = rest;
        for (const chunk of events) {
          handleStreamChunk(
            chunk as Parameters<typeof handleStreamChunk>[0],
            messageId,
            continueFromMessageId,
            setMessages,
          );
        }
      }
      return true;
    } catch (e) {
      console.warn('[auto-resume] attempt failed:', (e as Error).message);
      return false;
    }
  };

  while (retries <= 1) {
    const ok = await attemptOnce();
    if (ok) {
      // 成功:清掉 isStreaming 标记
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata: {
                  ...(m.metadata as Record<string, unknown> | undefined),
                  isStreaming: false,
                  isError: false,
                },
              }
            : m,
        ),
      );
      return;
    }
    retries += 1;
    if (retries <= 1) await new Promise((r) => setTimeout(r, 2000));
  }
  // 用完 retry → 标 isError
  setMessages((prev) =>
    prev.map((m) =>
      m.id === messageId
        ? {
            ...m,
            metadata: {
              ...(m.metadata as Record<string, unknown> | undefined),
              isStreaming: false,
              isError: true,
              errorMessage: '续推失败',
            },
          }
        : m,
    ),
  );
}

/**
 * 处理 UI Message Stream 单个 chunk,合并到 setMessages 里 messageId 对应条目。
 * 只关心 text-delta(text-start/end / finish 等不强制处理,useChat 自己会管理)。
 */
function handleStreamChunk(
  chunk: { type?: string; id?: string; delta?: string; [k: string]: unknown },
  messageId: string,
  _continueFromMessageId: number,
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void,
): void {
  if (!chunk.type) return;
  // text-delta → 把 (累积出的最新文本) 塞到对应 message 的 parts[0].text
  if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
    const delta = chunk.delta;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const parts = Array.isArray(m.parts) ? [...m.parts] : [];
        // 找/建 text part
        const textIdx = parts.findIndex((p) => (p as { type?: string }).type === 'text');
        let nextText = delta;
        if (textIdx >= 0) {
          const cur = (parts[textIdx] as { text?: string }).text ?? '';
          nextText = cur + delta;
          parts[textIdx] = { type: 'text', text: nextText };
        } else {
          parts.push({ type: 'text', text: nextText });
        }
        return { ...m, parts };
      }),
    );
  }
  // finish chunk → 流结束,触发 setMessages 已经在 resumeOne 里清 isStreaming
  // start chunk → 仅日志
  if (chunk.type === 'start') {
    // no-op
  }
  // message-metadata chunk → 透传 retrieval/tools metadata
  if (chunk.type === 'message-metadata') {
    const mm = chunk.messageMetadata as Record<string, unknown> | undefined;
    if (!mm) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              metadata: {
                ...(m.metadata as Record<string, unknown> | undefined),
                ...mm,
              },
            }
          : m,
      ),
    );
  }
}
