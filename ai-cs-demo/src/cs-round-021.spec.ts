/**
 * @status draft
 * @change-id cs-round-021
 *
 * cs-round-021: history 死循环堵死 + status=2 自动续推重新进入页面立即可见
 *
 * Why(为什么做):
 * 用户报:「我刷新页面或者断网再回来,history 接口被反复调用死循环,浏览器一直转圈」。
 * 同时期望行为:
 *   - status=2 (流式未完):离开页面再回来 → 已有 partial 立即出现 + 自动续推完剩下的
 *   - status=3 (用户主动 stop) / status=4 (出错):展示已有 partial + 标记,不自动续推
 *   - history 接口整个过程只调 1 次(不再因为 W11 兜底 effect refetch 后又被 autoResume
 *     续推、再触发 W11 refetch 的死循环而反复打)
 *
 * Bug 链路(W11(2026-08-05)兜底 effect 引入后触发,不在 cs-round-XXX 系列 commit 里):
 *   1. useChatState mount → GET /api/sessions/<id>/history
 *   2. status=2 占位 assistant → refetch-history.ts:43-57 打 isStreaming:true
 *   3. useAutoResumeStreaming 看到 isStreaming → POST /api/chat 续推
 *   4. 续推完 → useChat status=ready + 末尾 assistant 仍可能空(chunks 丢失)
 *   5. RAGChat.tsx W11 兜底 effect:「stream 完成 + 末尾空 assistant」又 refetch
 *   6. refetch → setMessages(restored) → messages 变 → effect 重跑(status 还是 ready,
 *      末尾还是空)→ 又 refetch → GET /history 风暴
 *
 * 修法(3 个 dedupe 点 + status=3 metadata):
 *   A1. useChatState effect 加 (fetchedSessionIdsRef, inFlightSessionIdRef,
 *       prevActiveIdRef):同 activeId 已 fetch / in-flight 跳过 fetch。
 *       切会话(URL 变化 → activeId 变)清空两个 ref,StrictMode 同 activeId 重跑保留。
 *   A2. RAGChat W11 兜底 effect 加 w11RefetchDedupeRef:以 `${sessionId}:${lastAssistantId}`
 *       作 key,refetch 过则 break。切会话(backendSessionId 变)清空 set。
 *   A3. RAGChat useRealtime.onMessage 加 seenOperatorMessageIdsRef:同 messageId
 *       (socket.io state recovery 重放 / 重连风暴)只处理 1 次 refetch。
 *   B. status=2 自动续推保留 — useAutoResumeStreaming 不动(已通过 cs-round-011
 *      spec 验证 isStreaming 守卫 + 完成后清 isStreaming)。首次 mount → 1 次
 *      history fetch → 1 次 autoResume → 完成 → W11 dedupe 拦住后续 refetch 循环。
 *   C. status=3 (interrupted) 在 refetch-history.ts 打 metadata:{aborted:true,
 *      abortedAt, isInterrupted:true};**不**打 isStreaming → useAutoResumeStreaming
 *      不会触发自动续推。status=4 (error) 走原 isError 分支(保留)。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — useChatState effect 加 sessionId dedupe refs
 *     Given ai-cs-demo/src/hooks/use-chat-state.ts 源码
 *     Then  useChatState 函数体必含 fetchedSessionIdsRef + inFlightSessionIdRef + prevActiveIdRef
 *     And   effect 体内必含 inFlightSessionIdRef.current === activeId 或
 *           fetchedSessionIdsRef.current.has(activeId) 的 dedupe 检查
 *     And   effect 内必含 prevActiveIdRef.current !== activeId 触发的清空分支
 *
 *   Scenario 2: 源码契约 — RAGChat W11 兜底 effect 用 (sessionId, lastAssistantId) dedupe
 *     Given ai-cs-demo/src/lib/components/RAGChat.tsx 源码
 *     Then  RAGChat 函数体必含 w11RefetchDedupeRef
 *     And   W11 兜底 effect 体内必含 w11RefetchDedupeRef.current.has(dedupeKey) 守卫
 *           (dedupeKey = `${backendSessionId}:${m.id}`)
 *     And   切 backendSessionId 必清空 w11RefetchDedupeRef(防 set 无限增长)
 *
 *   Scenario 3: 源码契约 — useRealtime.onMessage per-messageId dedupe
 *     Given ai-cs-demo/src/lib/components/RAGChat.tsx 源码
 *     Then  RAGChat 函数体必含 seenOperatorMessageIdsRef
 *     And   useRealtime.onMessage 回调内必含 seenOperatorMessageIdsRef.current.has(messageId) 守卫
 *
 *   Scenario 4: 行为 — status=3 打 aborted metadata,不打 isStreaming(防误续推)
 *     Given StoredMessage[] 包含 { role: 'assistant', status: 3, metadata: { abortedAt: '2026-08-05T...' } }
 *     When  storedToUIMessages(stored)
 *     Then  最后那条 assistant UIMessage 的 metadata.aborted === true
 *     And   metadata.abortedAt === '2026-08-05T...'
 *     And   metadata.isStreaming === undefined / 不存在(防 useAutoResumeStreaming 触发)
 *     And   metadata.isInterrupted === true
 *
 *   Scenario 5: 回归 — cs-round-017/018/020 契约仍成立
 *     Given useChatState 源码(RAGChat handleDeleteSession)
 *     Then  !activeId 分支仍含 setMessages([])
 *     And   handleDeleteSession 删 active 前仍含 setMessages([])
 *     And   useChatState effect 仍含 setMessages([]) → setBackendSessionId → fetch 的顺序(cs-round-020)
 *
 * Out of scope:
 * - 后端 NestJS / /api/chat 续推白名单(status=2/4)— 不动
 * - cs_message prisma schema — 不动
 * - useAutoResumeStreaming 主逻辑 — 不动(已通过 cs-round-011 spec 验证)
 * - W11 兜底 effect 的存在性 — 保留设计意图,只加 dedupe
 * - useChat (ai-sdk) messages 持久化逻辑 — 不动
 *
 * 落点:co-located ai-cs-demo/src/cs-round-021.spec.ts,
 *      验证 3 处 dedupe 源码契约 + status=3 metadata 行为 + cs-round-017/018/020 回归。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { storedToUIMessages } from '@/lib/refetch-history';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

function readCode(relPath: string): string {
  const text = readFileSync(resolve(PKG, relPath), 'utf-8');
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/')
      );
    })
    .join('\n');
}

function extractFunctionBody(code: string, fnName: string): string {
  // 兼容两种写法:`function name(...)` 与 `function name<...>(...)`(后者罕见,本仓未用)
  const startRe = new RegExp(`(?:export\\s+)?function\\s+${fnName}\\s*\\(`);
  const m = code.match(startRe);
  if (!m || m.index === undefined) return '';
  let i = m.index + m[0].length;
  let parenDepth = 1;
  while (i < code.length && parenDepth > 0) {
    const ch = code[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth--;
    i++;
  }
  while (i < code.length && code[i] !== '{') i++;
  if (i >= code.length) return '';
  const openBraceIdx = i;
  i++;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return code.slice(openBraceIdx + 1, i - 1);
}

describe('cs-round-021: history 死循环堵死 + status=2 自动续推', () => {
  // ── Scenario 1: useChatState 加 sessionId dedupe refs ──
  describe('Scenario 1: useChatState effect 含 sessionId dedupe refs', () => {
    it('Then useChatState 函数体必含 fetchedSessionIdsRef / inFlightSessionIdRef / prevActiveIdRef + dedupe 检查', () => {
      const code = readCode('src/hooks/use-chat-state.ts');
      const body = extractFunctionBody(code, 'useChatState');
      expect(body, '应能找到 useChatState 函数体').not.toBe('');

      expect(body, '必含 fetchedSessionIdsRef 声明').toMatch(/fetchedSessionIdsRef/);
      expect(body, '必含 inFlightSessionIdRef 声明').toMatch(/inFlightSessionIdRef/);
      expect(body, '必含 prevActiveIdRef 声明').toMatch(/prevActiveIdRef/);

      // dedupe 检查:同 activeId 已 in-flight 或已 fetched 跳过
      expect(
        body,
        'dedupe 检查必含 inFlightSessionIdRef.current === activeId 或 fetchedSessionIdsRef.current.has(activeId)',
      ).toMatch(
        /inFlightSessionIdRef\.current\s*===\s*activeId[\s\S]{0,200}fetchedSessionIdsRef\.current\.has\(\s*activeId\s*\)/,
      );

      // 切会话(URL 变化 → activeId 变)清空两个 ref 的分支
      expect(
        body,
        'prevActiveIdRef.current !== activeId 时清空 fetchedSessionIdsRef + inFlightSessionIdRef',
      ).toMatch(
        /prevActiveIdRef\.current\s*!==\s*activeId[\s\S]{0,200}fetchedSessionIdsRef\.current\.clear\(\)/,
      );
    });
  });

  // ── Scenario 2: RAGChat W11 兜底 effect 用 (sessionId, lastAssistantId) dedupe ──
  describe('Scenario 2: RAGChat W11 兜底 effect 含 (sessionId, lastAssistantId) dedupe', () => {
    it('Then RAGChat 必含 w11RefetchDedupeRef + has(dedupeKey) 守卫 + 切 backendSessionId 清空', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      expect(code, 'RAGChat 必含 w11RefetchDedupeRef 声明').toMatch(/w11RefetchDedupeRef/);

      // dedupe key 必须以 backendSessionId + lastAssistantId(m.id)拼出
      expect(
        code,
        'W11 兜底 effect 必以 `${backendSessionId}:${m.id}` 作 dedupeKey',
      ).toMatch(/\$\{[^}]*backendSessionId[^}]*\}:\$?\{[^}]*m\.id[^}]*\}/);

      // 守卫:已 refetch 过则 break / 不再调 refetch
      expect(
        code,
        'w11RefetchDedupeRef.current.has(dedupeKey) 守卫必存在',
      ).toMatch(/w11RefetchDedupeRef\.current\.has\(/);

      // 切 backendSessionId 必清空(useEffect(()=>{...clear()}, [backendSessionId]))
      expect(
        code,
        '切 backendSessionId 清空 w11RefetchDedupeRef.current.clear() 的 useEffect 必存在',
      ).toMatch(
        /w11RefetchDedupeRef\.current\.clear\(\)[\s\S]{0,80}\},\s*\[backendSessionId\]\)/,
      );
    });
  });

  // ── Scenario 3: useRealtime.onMessage per-messageId dedupe ──
  describe('Scenario 3: RAGChat useRealtime.onMessage per-messageId dedupe', () => {
    it('Then RAGChat 必含 seenOperatorMessageIdsRef + onMessage 回调内有 has(messageId) 守卫', () => {
      const code = readCode('src/lib/components/RAGChat.tsx');
      expect(
        code,
        'RAGChat 必含 seenOperatorMessageIdsRef 声明',
      ).toMatch(/seenOperatorMessageIdsRef/);

      // has 守卫使用 payload.messageId(OperatorReplyPayload.messageId)
      expect(
        code,
        'onMessage 回调必含 seenOperatorMessageIdsRef.current.has(payload.messageId) 守卫',
      ).toMatch(
        /seenOperatorMessageIdsRef\.current\.has\([\s\S]{0,40}payload\.messageId/,
      );
    });
  });

  // ── Scenario 4: status=3 metadata ──
  describe('Scenario 4: storedToUIMessages status=3 打 aborted metadata,不打 isStreaming', () => {
    it('Then status=3 分支必打 aborted:true + abortedAt + isInterrupted;不打 isStreaming', () => {
      const stored = [
        {
          id: 9001,
          sessionId: 235,
          role: 'assistant',
          content: '部分答案',
          parts: [{ type: 'text', text: '部分答案' }],
          metadata: { abortedAt: '2026-08-05T10:00:00.000Z' },
          status: 3,
          createdAt: '',
          updatedAt: '',
        },
      ];
      const out = storedToUIMessages(stored);
      expect(out).toHaveLength(1);
      const meta = (out[0] as unknown as { metadata?: Record<string, unknown> }).metadata ?? {};
      expect(meta.aborted, 'metadata.aborted 必为 true').toBe(true);
      expect(meta.abortedAt, 'metadata.abortedAt 必透传').toBe('2026-08-05T10:00:00.000Z');
      expect(meta.isInterrupted, 'metadata.isInterrupted 必为 true').toBe(true);
      expect(
        meta.isStreaming,
        'metadata.isStreaming 必不存在(useAutoResumeStreaming 不会触发自动续推)',
      ).toBeUndefined();
    });
  });

  // ── Scenario 5: 回归 — cs-round-017/018/020 契约仍成立 ──
  describe('Scenario 5: 回归 — cs-round-017 / 018 / 020 契约仍成立', () => {
    it('Then useChatState !activeId 分支仍清 messages + RAGChat handleDeleteSession 仍清 messages', () => {
      // cs-round-017 回归
      const useChatStateCode = readCode('src/hooks/use-chat-state.ts');
      expect(useChatStateCode, '!activeId 分支仍必含 setMessages([])').toMatch(
        /if\s*\(\s*!\s*activeId\s*\)\s*\{[\s\S]*?setMessages\(\s*\[\s*\]\s*\)/,
      );

      // cs-round-018 回归
      const ragChatCode = readCode('src/lib/components/RAGChat.tsx');
      const handleDeleteBody = extractFunctionBody(ragChatCode, 'handleDeleteSession');
      expect(handleDeleteBody, '应能找到 handleDeleteSession').not.toBe('');
      expect(handleDeleteBody, 'handleDeleteSession 删 active 前必含 setMessages([])').toMatch(
        /setMessages\(\s*\[\s*\]\s*\)/,
      );

      // cs-round-020 回归:setMessages([]) 必出现于 fetch 之前
      const useChatStateBody = extractFunctionBody(useChatStateCode, 'useChatState');
      const fetchIdx = useChatStateBody.search(/fetch\(/);
      expect(fetchIdx, 'fetch 应存在').toBeGreaterThanOrEqual(0);
      const beforeFetch = useChatStateBody.slice(0, fetchIdx);
      expect(
        beforeFetch,
        'setMessages([]) 必出现于 fetch 之前(cs-round-020 切会话清空残留)',
      ).toMatch(/setMessages\(\s*\[\s*\]\s*\)/);
    });
  });
});