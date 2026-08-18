/**
 * @status implemented
 * @change-id cs-round-059
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause cs-round-056 修了「点发送 + 立即刷新 → 孤儿空会话」(BFF upsert 同步
 *   写 user msg),但**没修 chat route 写 assistant placeholder 期间的
 *   client cancel**。prod 案例:session 72 (07:34) 和 session 80 (07:34) 的
 *   cs_message 都只有 user msg 没有 assistant → AI 没回复(因为 streamText 没起)。
 *
 *   复现:点发送 + 50ms / 100ms / 500ms cancel POST /api/chat → server 端 session
 *   setup 阶段(upsert + appendMessage(user skipped) + openTicket probe + assistant
 *   placeholder + FAQ + MCP)还没跑到 line 580-590 assistant placeholder create
 *   就被 HTTP request cancel → cs_message 永远只有 user msg。
 *
 * cs-round-059 修法:让 BFF upsert **同步**创建 assistant placeholder(status=2,
 *   content='', role=assistant, parts=[]),同 user msg 一起事务内写。chat route
 *   写 assistant placeholder 之前先查 cs_message(role=assistant, status=2),
 *   已有则不重复写。这样:
 *     1. client cancel chat route 早 → DB 仍有完整 user msg + assistant placeholder
 *        → /history 返回 2 条 → useAutoResumeStreaming 看到 status=2 + continueFromMessageId
 *        → 触发续推 → 用户重进时 AI 接着回复
 *     2. chat route 正常跑 → 看到已有 placeholder → 直接 updateMessage 而非 appendMessage
 *        → 不重复
 *
 *   Out of scope:
 *   - assistant placeholder 永远空的情况(用户发了但 AI 永远不回复)— 由 reaper 收敛
 *     (cs-round-002, status=2 → status=4 after 5min)
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. backend UpsertSessionDto 必须新增 `createAssistantPlaceholder?: boolean`
 *      字段(默认 false,向后兼容)
 *   B. backend service.upsertSession 在 firstUserMessage 写完后,若 dto
 *      .createAssistantPlaceholder=true → 同一事务写 assistant placeholder
 *      (status=2, role='assistant', content='', parts=[])
 *   C. backend service.upsertSession 必须返回「placeholder 信息」(id + role + status)
 *      让 BFF 知道是否需要再写(防重复)
 *   D. ai-cs-demo BFF /api/sessions/upsert 必须传 createAssistantPlaceholder=true
 *      (createSession 触发时)
 *   E. ai-cs-demo BFF erp-admin-client.upsertSession 签名加 createAssistantPlaceholder?
 *   F. ai-cs-demo use-sessions.createSession 加 createAssistantPlaceholder opts
 *      (默认 true — 新建会话场景)
 *   G. ai-cs-demo RAGChat.send 在 activeId=null 时透传 createAssistantPlaceholder: true
 *   H. ai-cs-demo /api/chat/route.ts assistant placeholder 创建前必须查
 *      「同 session 是否已有 status=2 assistant msg」,有则复用而非 appendMessage
 *      新建(防重复)
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

describe('cs-round-059: BFF upsert 同步写 assistant placeholder(防 client cancel 丢 AI 回复)', () => {
  describe('A. Given: erp-admin-backend upsert-session.dto.ts', () => {
    it('Then: UpsertSessionDto 必须新增 createAssistantPlaceholder?: boolean 字段', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/dto/upsert-session.dto.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'DTO 必须有 createAssistantPlaceholder 字段声明',
      ).toMatch(/createAssistantPlaceholder\s*\??\s*:\s*boolean/);
      expect(
        text,
        'createAssistantPlaceholder 必须有 @IsOptional 装饰器',
      ).toMatch(/@IsOptional[\s\S]*?createAssistantPlaceholder|createAssistantPlaceholder[\s\S]*?@IsOptional/);
      expect(
        text,
        'createAssistantPlaceholder 必须有 @IsBoolean 装饰器',
      ).toMatch(/@IsBoolean[\s\S]*?createAssistantPlaceholder|createAssistantPlaceholder[\s\S]*?@IsBoolean/);
    });
  });

  describe('B + C. Given: erp-admin-backend internal.service.ts upsertSession', () => {
    it('Then: dto.createAssistantPlaceholder=true 时事务内写 assistant placeholder 并返回 id', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 upsertSession 方法体
      const method = text.match(
        /async\s+upsertSession\s*\([\s\S]*?\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(method?.[0] ?? '', 'upsertSession 方法必须存在').toBeTruthy();
      const body = method![0];

      // 必须根据 dto.createAssistantPlaceholder 写 placeholder
      expect(
        body,
        'upsertSession 必须检查 dto.createAssistantPlaceholder 决定是否写 assistant placeholder',
      ).toMatch(/createAssistantPlaceholder/);

      // 必须有 placeholder create(role=assistant, status=2)
      expect(
        body,
        'upsertSession 写 assistant placeholder 必须 role=assistant + status=2',
      ).toMatch(/role\s*:\s*['"]assistant['"][\s\S]*?status\s*:\s*2|status\s*:\s*2[\s\S]*?role\s*:\s*['"]assistant['"]/);

      // 必须 messageCount +1(对齐 cs-round-001 单一真相)
      expect(
        body,
        'upsertSession 写 placeholder 后必须 messageCount increment 1',
      ).toMatch(/messageCount\s*:\s*\{\s*increment\s*:\s*1\s*\}/);

      // 返回必须包含 placeholder 信息
      expect(
        body,
        'upsertSession 返回值必须包含 assistantPlaceholder 信息(id / role / status)',
      ).toMatch(/assistantPlaceholder/);
    });
  });

  describe('D + E. Given: ai-cs-demo erp-admin-client + BFF upsert route', () => {
    it('Then: erp-admin-client.upsertSession 必须加 createAssistantPlaceholder? + BFF upsert route 透传', () => {
      const clientPath = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      const routePath = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/sessions/upsert/route.ts',
      );
      expect(existsSync(clientPath)).toBe(true);
      expect(existsSync(routePath)).toBe(true);

      const clientText = stripComments(readFileSync(clientPath, 'utf-8'));
      const routeText = stripComments(readFileSync(routePath, 'utf-8'));

      // erp-admin-client payload 必须有 createAssistantPlaceholder
      expect(
        clientText,
        'erp-admin-client upsertSession payload 必须有 createAssistantPlaceholder? 字段',
      ).toMatch(/createAssistantPlaceholder\s*\??\s*:\s*boolean/);

      // BFF upsert route 必须读 body.createAssistantPlaceholder
      expect(
        routeText,
        'BFF upsert route 必须读 body.createAssistantPlaceholder',
      ).toMatch(/body\.createAssistantPlaceholder/);

      // 必须透传给 erp.upsertSession
      expect(
        routeText,
        'BFF upsert route 必须把 createAssistantPlaceholder 透传给 erp.upsertSession',
      ).toMatch(/createAssistantPlaceholder\s*:/);
    });
  });

  describe('F + G. Given: ai-cs-demo use-sessions + RAGChat', () => {
    it('Then: use-sessions.createSession 加 createAssistantPlaceholder opts + RAGChat.send 在 activeId=null 时传 true', () => {
      const hookPath = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');
      const ragchatPath = resolve(
        ROOT,
        'ai-cs-demo/src/lib/components/RAGChat.tsx',
      );
      expect(existsSync(hookPath)).toBe(true);
      expect(existsSync(ragchatPath)).toBe(true);

      const hookText = stripComments(readFileSync(hookPath, 'utf-8'));
      const ragText = stripComments(readFileSync(ragchatPath, 'utf-8'));

      // use-sessions.createSession 必须有 createAssistantPlaceholder opts
      const createSessionBody = hookText.match(
        /const\s+createSession\s*=\s*useCallback\s*\([\s\S]*?\}\s*,\s*\[\]\s*\)/,
      );
      expect(createSessionBody?.[0] ?? '', 'createSession useCallback 必须存在').toBeTruthy();
      expect(
        createSessionBody![0],
        'createSession opts 必须有 createAssistantPlaceholder 字段',
      ).toMatch(/createAssistantPlaceholder\s*\??:/);

      // 必须 fetch body 带 createAssistantPlaceholder
      expect(
        createSessionBody![0],
        'createSession fetch body 必须带 createAssistantPlaceholder 字段',
      ).toMatch(/createAssistantPlaceholder\s*:/);

      // RAGChat.send 在 activeId=null 时必须传 true
      const sendBody = ragText.match(
        /function\s+send\s*\(\s*text\s*:\s*string\s*\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(sendBody?.[0] ?? '', 'send 函数必须存在').toBeTruthy();
      expect(
        sendBody![0],
        'send 内 createSession 调用必须传 createAssistantPlaceholder: true',
      ).toMatch(/createAssistantPlaceholder\s*:\s*true/);
    });
  });

  describe('H. Given: ai-cs-demo /api/chat/route.ts', () => {
    it('Then: assistant placeholder 创建前必须查「已有 status=2 assistant msg」,有则复用', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 getSessionMessages 调用查 status=2 assistant
      expect(
        text,
        'chat route 写 assistant placeholder 前必须 getSessionMessages 查已有 status=2 assistant',
      ).toMatch(/getSessionMessages\s*\(\s*sessionId/);

      // 必须有判断 status === 2 + role === 'assistant'
      expect(
        text,
        'chat route 必须判断 role === assistant + status === 2 的已有 placeholder',
      ).toMatch(/role\s*===?\s*['"]assistant['"][\s\S]*?status\s*===?\s*2|status\s*===?\s*2[\s\S]*?role\s*===?\s*['"]assistant['"]/);
    });
  });
});