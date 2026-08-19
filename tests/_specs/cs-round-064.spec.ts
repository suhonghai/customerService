/**
 * @status pending
 * @change-id cs-round-064
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause 新建会话发首条消息时,/api/chat (chat #1) 被多调一次 + /history 被多调一次,
 *   /history 拉回的 status=2 placeholder 触发 useAutoResumeStreaming 误触发续推(chat #2)。
 *
 *   链路:
 *     1. sendMessage() → POST /api/chat (chat #1,正常 SSE 流)
 *     2. createSession() 异步 fetch /api/sessions/upsert
 *     3. upsert 返回 { id: 115 } → setActiveId(115)
 *     4. activeId 从 draft(null) → tempId(-xxx) → backendId(115)
 *     5. useChatState useEffect 依赖 [activeId],activeId 变 backendId 时**无条件**
 *        fetch /api/sessions/115/history (history #2)
 *     6. /history 返回 [{id:122, user, status=1}, {id:123, assistant, status=2}]
 *     7. storedToUIMessages 把 id=123 翻译成 metadata.isStreaming=true +
 *        continueFromMessageId=123
 *     8. useChatState diff/append:id=123 与本地 client-xxx (SSE 流推的 placeholder)
 *        id 不同(content 都空,role 都 assistant,但 timing race 下 SSE start chunk
 *        可能还没推 client-xxx)→ 兜底去重不命中 → 加入 messages
 *     9. useAutoResumeStreaming 扫描 messages → 看到 id=123 isStreaming →
 *        触发续推 → POST /api/chat (chat #2, ❌)
 *
 *   关键观察:第 5 步的 fetch /history 是多余的 — 本地 useChat state 已经在流式
 *   生成 (chat #1 的 SSE 推着 user msg + assistant placeholder),不需要再拉 DB。
 *   /history 拉回的 placeholder (id=DB id) 与本地 useChat 流的 placeholder
 *   (id=client id) 是两条不同的 msg,被 useAutoResumeStreaming 误判为续推场景。
 *
 * cs-round-064 修法(2 处改动,总 ~12 行):
 *   A. useChatState 加 chatStatus prop(由 RAGChat 把 useChat 的 status 传进来)。
 *      activeId effect 用 chatStatusRef 同步(避免 status 变化触发 activeId effect 重跑)。
 *   B. useChatState activeId effect 加跳过分支:
 *      条件 = chatStatus 是 'submitted'/'streaming'(本地正在流)
 *           AND prev 是 null 或负数 tempId(从 draft → backendId 路径)
 *           AND 当前 activeId 是 backendId(正整数)
 *      行为 = setBackendSessionId(backendIdNum) + return(WS connect 仍要,fetch /history 跳过)
 *
 *   为什么用 chatStatus 而不是 messages.some(role==='user') 判断:
 *     - messages 在切会话时残留(useChat state 跨 activeId 共用),
 *       draft → 切到 77 时 messages 可能有上次的 user msg → 误判
 *     - status='submitted'/'streaming' 几乎只在 sendMessage 路径下发生,
 *       切会话 / 刷新场景 status='ready' 或 'error'
 *
 *   Out of scope:
 *   - 改 useAutoResumeStreaming 触发条件 — 治本应该是 messages 数组不出现重复 msg,
 *     但 cs-round-064 直接修根因(history 不该被调),其他触发链不变
 *   - 改 storedToUIMessages 翻译 status=2 → isStreaming 的逻辑 — 这是设计,
 *     "status=2 = 刷新场景占位"的语义保留
 *   - 改 useChat sendMessage 推 assistant placeholder 的方式 — 同上
 *   - 改后端 chat/route.ts / BFF upsert — 与本前端修法无关
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

function stripComments(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') &&
        !t.startsWith('/*') &&
        !t.startsWith('*') &&
        !t.startsWith('*/')
      );
    })
    .join('\n');
}

describe('cs-round-064: 新建会话误调 /history → useAutoResumeStreaming 误触发续推', () => {
  describe('A. useChatState 加 chatStatus prop', () => {
    it('Then: UseChatStateOptions 接口必须含 chatStatus 字段', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.1:UseChatStateOptions 必须有 chatStatus 可选字段
      expect(
        text,
        'UseChatStateOptions 必须包含 chatStatus?: submitted|streaming|ready|error',
      ).toMatch(
        /chatStatus\s*\?\s*:\s*['"]submitted['"]\s*\|\s*['"]streaming['"]\s*\|\s*['"]ready['"]\s*\|\s*['"]error['"]/,
      );
    });

    it('Then: useChatState 函数签名必须解构 chatStatus', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.2:useChatState({...}) 必须解构 chatStatus
      expect(
        text,
        'useChatState 函数签名必须解构 chatStatus',
      ).toMatch(/useChatState\s*\(\s*\{[\s\S]*?chatStatus[\s\S]*?\}\s*:/);
    });

    it('Then: 必须有 chatStatusRef 同步 chatStatus(避免 deps 触发 effect 重跑)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.3:chatStatusRef 同步 ref,effect 用 ref.current 读(不让 status 进 deps)
      expect(
        text,
        'useChatState 必须有 chatStatusRef(同步 status 不进 deps)',
      ).toMatch(/chatStatusRef/);
      expect(
        text,
        'chatStatusRef.current 必须被同步写入(避免 effect deps 包含 status)',
      ).toMatch(/chatStatusRef\.current\s*=\s*chatStatus/);
    });
  });

  describe('B. useChatState activeId effect 加跳过分支', () => {
    it('Then: effect 必须在 status+prev-draft/tempId+backendId 时跳过 fetch', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.1:跳过条件必须同时包含:
      //   a) chatStatusRef === 'submitted'/'streaming'(本地正在流)
      //   b) prevActiveIdBeforeUpdate === null(draft 态)
      //   c) /^-/.test(prev)(tempId 负数)
      //   d) backendIdNum > 0(当前是 backendId)
      // 用一个宽匹配包含整个 if 块
      const skipBlockMatch = text.match(
        /if\s*\([\s\S]{0,500}?chatStatusRef[\s\S]{0,500}?return\s*;/,
      );
      expect(
        skipBlockMatch?.[0] ?? '',
        'skip 分支必须存在',
      ).toBeTruthy();

      // 单独验证每个条件(更精确)
      const skipText = skipBlockMatch![0];
      expect(
        skipText,
        'skip 条件必须检查 status 是 submitted 或 streaming',
      ).toMatch(/['"]submitted['"]|['"]streaming['"]/);
      expect(
        skipText,
        'skip 条件必须检查 prevActiveIdBeforeUpdate === null(draft)',
      ).toMatch(/prevActiveIdBeforeUpdate\s*===\s*null/);
      expect(
        skipText,
        'skip 条件必须检查 prev 是负数(tempId)',
      ).toMatch(/\.test\(\s*prevActiveIdBeforeUpdate\s*\)/);
    });

    it('Then: skip 分支必须 setBackendSessionId(WS connect 仍要)+ return', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.2:skip 分支必须设 backendSessionId(WS 需要)
      const skipBlockMatch = text.match(
        /if\s*\([\s\S]{0,500}?chatStatusRef[\s\S]{0,500}?return\s*;/,
      );
      expect(
        skipBlockMatch?.[0] ?? '',
        'skip 分支必须调 setBackendSessionId(backendIdNum)',
      ).toMatch(/setBackendSessionId\s*\(\s*backendIdNum\s*\)/);
    });
  });

  describe('C. RAGChat 必须传 chatStatus', () => {
    it('Then: useChatState 调用必须含 chatStatus 参数', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/components/RAGChat.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 C.1:useChatState({...}) 必须传 chatStatus
      expect(
        text,
        'useChatState 调用必须含 chatStatus 参数',
      ).toMatch(/useChatState\s*\(\s*\{[^}]*chatStatus\s*:/s);
    });
  });

  describe('回归契约 1:切已有会话(backendA → backendB)仍要 fetch /history', () => {
    it('Then: useChatState 必须仍调 fetch /api/sessions/${id}/history', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 防 cs-round-064 改动把切会话 fetch 也拦了
      expect(
        text,
        'useChatState 必须仍调 fetch /api/sessions/${backendIdNum}/history(切会话场景回归)',
      ).toMatch(/fetch\s*\(\s*`\/api\/sessions\/\$\{backendIdNum\}\/history`/);
    });
  });

  describe('回归契约 2:status=2 placeholder → isStreaming 翻译不被破坏', () => {
    it('Then: refetch-history storedToUIMessages 仍要把 status=2 标 isStreaming', () => {
      // 刷新场景(status=2 → 自动续推)的产品行为保留
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/refetch-history.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'storedToUIMessages 必须仍把 status=2 翻译成 isStreaming(刷新场景回归)',
      ).toMatch(/status\s*===\s*2[\s\S]{0,400}isStreaming\s*:\s*true/);
    });
  });

  describe('回归契约 3:useAutoResumeStreaming 触发条件不被破坏', () => {
    it('Then: useAutoResumeStreaming 仍接受 isStreaming OR isError 触发', () => {
      // cs-round-062 的改动(isStreaming || isError)不被破坏
      // cs-round-064 治本是 useChatState,useAutoResumeStreaming 维持现状
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const useEffectBody = text.match(
        /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[^\]]+\]\s*\)/,
      );
      expect(
        useEffectBody?.[0] ?? '',
        'useAutoResumeStreaming 必须有 useEffect',
      ).toBeTruthy();
      expect(
        useEffectBody![0],
        '续推触发条件不能退化为只认 is streaming(防 status=4 跳过)',
      ).not.toMatch(/if\s*\(\s*!\s*meta\.isStreaming\s*\)\s*continue\s*;/);
      expect(
        useEffectBody![0],
        '续推触发条件必须包含 isError(cs-round-062 回归)',
      ).toMatch(/isError/);
    });
  });
});