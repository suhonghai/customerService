'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import { ChatBubble } from './ChatBubble';
import type { ChatBubbleProps } from './ChatBubble';
import { WelcomeMessage } from './WelcomeMessage';
import { MessageInput } from './MessageInput';
import { DecisionTrace } from '@/components/DecisionTrace';
import { ErrorBubble } from '@/components/ErrorBubble';
import { RatingButtons } from '@/components/RatingButtons';
import { EscalateButton, EscalateBubble } from '@/components/EscalateButton';
import type { UserFacingError, UserFacingErrorActionType } from '@/lib/errors';

export interface ChatViewProps {
  messages: UIMessage[];
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  input: string;
  isLoading: boolean;
  kbReady: boolean;
  /** useSessions 已 hydrate(localStorage + 后端 fetch 完成)— false 时不显示 welcome,
   * 避免 sessions 还在加载时「您好我是小服」抢跑 */
  sessionsReady: boolean;
  userError: UserFacingError | null;
  streamError: UserFacingError | null;
  abortedIds: Set<string>;
  escalationMap: Record<
    string,
    { escalationId: string; estimatedWaitMinutes: number; urgency: string }
  >;
  sessionHasOperator: boolean;
  activeId: string | null;
  /**
   * cs-round-028:字符串 sessionKey(per browser,nanoid 派生,格式如
   * "cs-1786085192010-p4vw64ll")— 来自 useSessions 的 activeSession.sessionKey。
   * 与 activeId(数字 sessionId 字符串,如 "285")严格区分,前者透传到
   * EscalateButton → /api/escalate → 后端按 string unique 查 cs_session。
   * 传错格式会让后端 silently null 化 cs_ticket.session_id,造成工单孤儿。
   */
  activeSessionKey: string | null;
  debugTrace: boolean;
  debugRetrieval: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  formatTime: (d: Date) => string;
  onChangeInput: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onQuickQuestion: (q: string) => void;
  onRetry: (messageId: string) => void;
  onErrorAction: (type: UserFacingErrorActionType) => void;
  setEscalationMap: React.Dispatch<
    React.SetStateAction<
      Record<string, { escalationId: string; estimatedWaitMinutes: number; urgency: string }>
    >
  >;
}

/** ChatView 实际访问的 part 最小结构 */
interface ViewPart {
  type: string;
  text?: string;
}

/** ChatView 实际访问的 metadata 最小结构 */
interface ChatMetadata {
  usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number };
  retrieval?: unknown;
  aborted?: boolean;
  isInterrupted?: boolean;
  source?: string;
  ticketNo?: string;
  operatorName?: string;
  [key: string]: unknown;
}

/** ChatView 实际访问的 message 字段(ai sdk 6.x UIMessage 子集) */
interface ViewMessage {
  id: string;
  role: string;
  parts?: ViewPart[];
  metadata?: ChatMetadata;
}

export function ChatView(props: ChatViewProps) {
  const {
    messages,
    status,
    input,
    isLoading,
    kbReady,
    sessionsReady,
    userError,
    streamError,
    abortedIds,
    escalationMap,
    sessionHasOperator,
    activeId,
    activeSessionKey,
    debugTrace,
    debugRetrieval,
    messagesEndRef,
    formatTime,
    onChangeInput,
    onSubmit,
    onStop,
    onQuickQuestion,
    onRetry,
    onErrorAction,
    setEscalationMap,
  } = props;
  // W11:旧 DB 里有 status=2/3 中断 message,刷新进来后让 server 静默重生成。
  // 不用 banner 提示 — server 端 streamText 已 detach req.signal(commit 6583e1b),
  // 新消息一律落 status=1;老中断消息由本 useEffect 静默清理,UI 看不到按钮。
  // useRef 记录「已重试 id」防止循环触发(同一 message id 只调一次)。
  const autoRetriedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const raw = messages[i] as unknown as ViewMessage;
      if (raw.role !== 'assistant') continue;
      if (!raw.id) return;
      if (autoRetriedRef.current.has(raw.id)) return;
      if (!raw.metadata?.isInterrupted) return;
      const textNow = (raw.parts ?? [])
        .filter((p: ViewPart) => p.type === 'text')
        .map((p: ViewPart) => p.text)
        .join('');
      if (textNow && textNow.length > 0) return;
      autoRetriedRef.current.add(raw.id);
      onRetry(raw.id);
      return;
    }
  }, [messages, status, onRetry]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        {messages.length === 0 && (!kbReady || !sessionsReady) && (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            正在加载…
          </div>
        )}
        {messages.length === 0 && kbReady && sessionsReady && (
          <WelcomeMessage onSelectQuestion={onQuickQuestion} disabled={isLoading} />
        )}
        {messages.length > 0 && (
          <div className="space-y-6 max-w-3xl mx-auto">
            {messages.map((raw) => {
              const m = raw as unknown as ViewMessage;
              const text =
                m.parts
                  ?.filter((p: ViewPart) => p.type === 'text')
                  .map((p: ViewPart) => p.text)
                  .join('') || '';
              const reasoning =
                (m.metadata as Record<string, unknown> | undefined)?.reasoning || '';
              const metadata = m.role === 'assistant' ? m.metadata : undefined;
              const retrieval = metadata;
              const usage = metadata?.usage;
              const aborted =
                (m.role === 'assistant' && metadata?.aborted === true) || abortedIds.has(m.id);
              const isAssistant = m.role === 'assistant';
              return (
                <ChatBubble
                  key={m.id}
                  role={m.role}
                  text={text}
                  reasoning={reasoning ? String(reasoning) : ''}
                  timeLabel={formatTime(new Date())}
                  operatorBadge={
                    metadata?.source === 'operator'
                      ? { ticketNo: metadata.ticketNo, operatorName: metadata.operatorName }
                      : undefined
                  }
                  aborted={aborted}
                  status={status}
                  usage={
                    usage
                      ? {
                          totalTokens:
                            (usage.totalTokens ?? 0) ||
                            (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
                          cost: 0,
                        }
                      : undefined
                  }
                  retrieval={
                    retrieval
                      ? ({
                          query: (retrieval as { query?: string }).query ?? '',
                          topK: (retrieval as { topK?: number }).topK ?? 0,
                          results: (retrieval as { results?: unknown[] }).results ?? [],
                        } as ChatBubbleProps['retrieval'])
                      : undefined
                  }
                  showDebugTrace={debugTrace}
                  showDebugRetrieval={debugRetrieval}
                  decisionTrace={
                    isAssistant ? <DecisionTrace parts={m.parts ?? []} hasText={!!text} /> : null
                  }
                  rating={isAssistant && text ? <RatingButtons messageId={m.id} /> : null}
                  escalation={
                    isAssistant &&
                    text &&
                    !sessionHasOperator &&
                    metadata?.source !== 'operator' ? (
                      escalationMap[m.id] ? (
                        <EscalateBubble
                          escalationId={escalationMap[m.id].escalationId}
                          estimatedWaitMinutes={escalationMap[m.id].estimatedWaitMinutes}
                          urgency={escalationMap[m.id].urgency}
                        />
                      ) : (
                        <EscalateButton
                          reason={text.slice(0, 200) || '需要人工协助'}
                          disabled={isLoading}
                          sessionKey={activeSessionKey ?? ''}
                          onEscalated={(info) =>
                            setEscalationMap((prev) => ({ ...prev, [m.id]: info }))
                          }
                        />
                      )
                    ) : null
                  }
                />
              );
            })}
            {userError && <ErrorBubble error={userError} onAction={onErrorAction} />}
            {kbReady && streamError && !userError && (
              <ErrorBubble error={streamError} onAction={onErrorAction} />
            )}
            {status === 'submitted' && (
              <div
                className="text-sm flex items-center gap-2"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--brand-primary)' }}
                />
                AI 正在思考...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <MessageInput
        value={input}
        onChange={onChangeInput}
        onSubmit={onSubmit}
        isLoading={isLoading}
        onStop={onStop}
      />
    </div>
  );
}
