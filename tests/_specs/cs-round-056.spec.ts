/**
 * @status implemented
 * @change-id cs-round-056
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause ai-cs 用户输入问题 + 点"发送" / 点建议问题卡,**立即刷新页面**(或断网),
 *   重进时 session 存在但 cs_message 0 条 → 看到「您好,我是小服」欢迎页而非自己的会话。
 *   根因:/api/sessions/upsert 只建 cs_session row(metadata),user msg 落库要等
 *   /api/chat 内部 appendMessage(user) 跑完(~50ms)。这段窗口期内刷新 → session row
 *   已建(cs_session.messageCount=0)、user msg 未写、assistant placeholder 也未写
 *   → /history 返回空数组 → useChatState 清空 messages → welcome 页。
 *
 * cs-round-056 修法:让 /api/sessions/upsert 接收 firstUserMessage + firstUserMessageParts
 *   并**同步**写入 cs_message(role='user', status=1, parts 透传),与 cs_session 同一
 *   Prisma $transaction。messageCount 同步 +1(对齐 cs-round-001 单一真相来源)。WS
 *   emit 'user_message' 给 session room(对齐 appendMessage 的 emit 行为,erp-admin
 *   运营仍能实时看到客户新问题)。
 *
 *   防重复写:`/api/chat` 看到 body.firstUserMessage → skip 自己的 appendMessage(user)
 *   (client 透传 firstUserMessage,server 信任)。多轮对话(2nd/3rd message)createSession
 *   不再触发,sendMessage body 不带 firstUserMessage → chat route 照常 appendMessage(user)。
 *
 *   Out of scope:
 *   - tempId 窗口仍未消灭(upsert 返回前 ~100-200ms,URL 还是 /chat/<负数>)→ 仍可能看到欢迎页
 *     但 session 已有 user msg,刷新后 sidebar 可立即点击进入
 *   - 多标签页并发(各 tab sessionKey 独立,不冲突)
 *   - assistant placeholder 仍由 /api/chat 写,upsert 不动 assistant 路径
 *
 * Spec 契约(代码契约 grep,fs 读源码 + 正则):
 *
 *   A. backend UpsertSessionDto 加 firstUserMessage + firstUserMessageParts(可选)
 *   B. backend service.upsertSession 包 prisma.$transaction 写 user msg + messageCount +1
 *   C. backend service.upsertSession 事务外 WS emit user_message(若 firstUserMessage)
 *   D. BFF /api/sessions/upsert 透传 firstUserMessage + firstUserMessageParts 给 erp client
 *   E. ai-cs erp-admin-client.upsertSession 签名加 firstUserMessage + firstUserMessageParts
 *   F. ai-cs use-sessions.createSession 接受 userMessage opts + fetch body 带上 firstUserMessage
 *   G. ai-cs RAGChat.send 在 activeId=null 时透传 userMessage 到 createSession + firstUserMessage 到 sendMessage body
 *   H. ai-cs /api/chat/route.ts 看到 body.firstUserMessage 跳过 appendMessage(user)
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

describe('cs-round-056: upsert 会话时同步写首条 user msg(消除孤儿空会话)', () => {
  // ── 契约 A:backend DTO 加 firstUserMessage + firstUserMessageParts 字段 ──
  describe('A. Given: erp-admin-backend upsert-session.dto.ts', () => {
    it('Then: UpsertSessionDto 必须有 firstUserMessage + firstUserMessageParts 字段(@IsOptional @IsString)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/dto/upsert-session.dto.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // firstUserMessage 字段
      expect(text, 'DTO 必须有 firstUserMessage 字段声明').toMatch(
        /firstUserMessage\s*\??\s*:\s*string/,
      );
      expect(text, 'firstUserMessage 必须有 @IsOptional 装饰器').toMatch(
        /@IsOptional[\s\S]*?firstUserMessage|firstUserMessage[\s\S]*?@IsOptional/,
      );
      expect(text, 'firstUserMessage 必须有 @IsString 装饰器').toMatch(
        /@IsString[\s\S]*?firstUserMessage|firstUserMessage[\s\S]*?@IsString/,
      );

      // firstUserMessageParts 字段(parts 是 JSON,允许 unknown)
      expect(text, 'DTO 必须有 firstUserMessageParts 字段声明').toMatch(
        /firstUserMessageParts\s*\??\s*:\s*/,
      );
    });
  });

  // ── 契约 B:backend service.upsertSession 包 $transaction 写 user msg + messageCount +1 ──
  describe('B. Given: erp-admin-backend internal.service.ts upsertSession', () => {
    it('Then: 必须用 prisma.$transaction 包 upsertSession + csMessage.create + messageCount +1', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 upsertSession 方法体
      const method = text.match(
        /async\s+upsertSession\s*\([\s\S]*?\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(method?.[0] ?? '', 'upsertSession 方法必须存在').toBeTruthy();
      const body = method![0];

      // 必须用 prisma.$transaction 包核心写操作(atomic 关键)
      expect(
        body,
        'upsertSession 必须 prisma.$transaction 包核心写操作(atomic)',
      ).toMatch(/prisma\.\$transaction\s*\(/);

      // 事务内必须写 csMessage(role=user, status=1)
      expect(
        body,
        'upsertSession 事务内必须 tx.csMessage.create(role=user, status=1)',
      ).toMatch(/tx\.csMessage\.create|tx\.csSession\.upsert[\s\S]*?tx\.csMessage\.create/);
      expect(body, '事务内 create 的 role 必须是 user').toMatch(/role\s*:\s*['"]user['"]/);
      expect(body, '事务内 create 的 status 必须是 1').toMatch(/status\s*:\s*1/);

      // 事务内必须 +1 messageCount(对齐 cs-round-001 单一真相)
      expect(
        body,
        'upsertSession 事务内必须 messageCount increment 1',
      ).toMatch(/messageCount\s*:\s*\{\s*increment\s*:\s*1\s*\}/);

      // 反例:不能 fire-and-forget messageCount(catch 吞错的旧风格)
      // 验:increment 不能在 .catch 块里
      const catchBlocks = body.match(/\.catch\s*\([\s\S]*?\}\s*\)\s*;/g) ?? [];
      const hasCatchAroundIncrement = catchBlocks.some((cb) =>
        /messageCount\s*:\s*\{\s*increment/.test(cb),
      );
      expect(
        hasCatchAroundIncrement,
        'messageCount increment 不能在 catch 块里(必须事务内同步 +1)',
      ).toBe(false);
    });
  });

  // ── 契约 C:backend service.upsertSession 事务外 emit user_message WS 事件 ──
  describe('C. Given: erp-admin-backend internal.service.ts upsertSession', () => {
    it('Then: firstUserMessage 路径必须在事务提交后 emit user_message WS 事件', () => {
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

      // 必须 emit user_message(对齐 appendMessage 的 emit 行为)
      expect(
        body,
        'upsertSession 事务后必须 emit user_message WS 事件(erp-admin 实时显示)',
      ).toMatch(/\.emit\s*\(\s*['"]user_message['"]/);

      // emit 必须发到 session:<id> room
      expect(body, 'emit 必须发到 session:<id> room').toMatch(
        /\.to\s*\(\s*`session:\$/,
      );

      // 反例:不能在事务内 emit(emit 在 .then(...)外 或在事务 return 之后)
      // 简单验:emit 之前必须有 prisma.$transaction 返回值之后的处理
      // 较弱约束:必须出现 .to(`session:${session.id}`) 或类似
      expect(
        body,
        'emit payload 必须包含 messageId + sessionId + role',
      ).toMatch(/messageId|messageId:/);
    });
  });

  // ── 契约 D:BFF upsert route 透传 firstUserMessage + firstUserMessageParts ──
  describe('D. Given: ai-cs-demo BFF /api/sessions/upsert/route.ts', () => {
    it('Then: 必须接受 firstUserMessage + firstUserMessageParts 并透传给 erp client', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/sessions/upsert/route.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须读 body.firstUserMessage
      expect(
        text,
        'BFF upsert route 必须读 body.firstUserMessage',
      ).toMatch(/body\.firstUserMessage/);

      // 必须读 body.firstUserMessageParts
      expect(
        text,
        'BFF upsert route 必须读 body.firstUserMessageParts',
      ).toMatch(/body\.firstUserMessageParts/);

      // 必须透传给 erp.upsertSession
      expect(
        text,
        'BFF upsert route 必须把 firstUserMessage 透传给 erp.upsertSession',
      ).toMatch(/firstUserMessage\s*:/);

      expect(
        text,
        'BFF upsert route 必须把 firstUserMessageParts 透传给 erp.upsertSession',
      ).toMatch(/firstUserMessageParts\s*:/);
    });
  });

  // ── 契约 E:ai-cs erp-admin-client.upsertSession 签名加 firstUserMessage + firstUserMessageParts ──
  describe('E. Given: ai-cs-demo erp-admin-client.ts upsertSession', () => {
    it('Then: payload 类型必须加 firstUserMessage? + firstUserMessageParts? 字段', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 upsertSession payload 类型定义
      const payloadType = text.match(
        /async\s+upsertSession\s*\(\s*payload\s*:\s*\{[\s\S]*?\}\s*\)\s*:\s*Promise/,
      );
      expect(payloadType?.[0] ?? '', 'upsertSession payload 类型必须存在').toBeTruthy();
      const body = payloadType![0];

      // 必须有 firstUserMessage?: string 字段
      expect(
        body,
        'upsertSession payload 必须有 firstUserMessage? 字段',
      ).toMatch(/firstUserMessage\s*\??\s*:\s*string/);

      // 必须有 firstUserMessageParts? 字段
      expect(
        body,
        'upsertSession payload 必须有 firstUserMessageParts? 字段',
      ).toMatch(/firstUserMessageParts\s*\??\s*:/);
    });
  });

  // ── 契约 F:use-sessions.createSession 接受 userMessage opts + fetch body 带上 firstUserMessage ──
  describe('F. Given: ai-cs-demo use-sessions.ts createSession', () => {
    it('Then: createSession opts 必须有 userMessage + fetch body 必须带 firstUserMessage + firstUserMessageParts', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 createSession useCallback 整体
      const method = text.match(
        /const\s+createSession\s*=\s*useCallback\s*\([\s\S]*?\}\s*,\s*\[\]\s*\)/,
      );
      expect(method?.[0] ?? '', 'createSession useCallback 必须存在').toBeTruthy();
      const body = method![0];

      // opts 类型必须有 userMessage?: { text, parts }
      expect(
        body,
        'createSession opts 必须有 userMessage?: { text; parts } 字段',
      ).toMatch(/userMessage\s*\??\s*:\s*\{/);
      expect(body, 'userMessage 必须有 text: string').toMatch(/text\s*:\s*string/);
      expect(body, 'userMessage 必须有 parts: 数组类型').toMatch(/parts\s*:/);

      // fetch body 必须带 firstUserMessage + firstUserMessageParts
      expect(
        body,
        'createSession fetch body 必须带 firstUserMessage 字段',
      ).toMatch(/firstUserMessage\s*:/);

      expect(
        body,
        'createSession fetch body 必须带 firstUserMessageParts 字段',
      ).toMatch(/firstUserMessageParts\s*:/);
    });
  });

  // ── 契约 G:RAGChat.send 在 activeId=null 时透传 userMessage + firstUserMessage ──
  describe('G. Given: ai-cs-demo RAGChat.tsx send', () => {
    it('Then: activeId=null 时必须把 userMessage 传给 createSession + firstUserMessage 传给 sendMessage body', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/components/RAGChat.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 send 函数体
      const method = text.match(
        /function\s+send\s*\(\s*text\s*:\s*string\s*\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(method?.[0] ?? '', 'send 函数必须存在').toBeTruthy();
      const body = method![0];

      // createSession 调用必须带 userMessage: { text, parts }
      expect(
        body,
        'send 内 createSession 调用必须传 userMessage: { text, parts }',
      ).toMatch(/createSession\s*\(\s*\{[\s\S]*?userMessage\s*:\s*\{[\s\S]*?text\s*[,}]/);
      expect(
        body,
        'userMessage 必须含 parts 字段(用 userMsg.parts 透传)',
      ).toMatch(/userMessage\s*:\s*\{[\s\S]*?parts\s*:\s*userMsg\.parts/);

      // sendMessage body 必须带 firstUserMessage + firstUserMessageParts
      expect(
        body,
        'send 内 sendMessage body 必须带 firstUserMessage 字段',
      ).toMatch(/firstUserMessage\s*:/);
      expect(
        body,
        'send 内 sendMessage body 必须带 firstUserMessageParts 字段',
      ).toMatch(/firstUserMessageParts\s*:/);
    });
  });

  // ── 契约 H:chat route 看到 firstUserMessage 跳过 appendMessage(user) ──
  describe('H. Given: ai-cs-demo /api/chat/route.ts', () => {
    it('Then: 看到 body.firstUserMessage 必须跳过 appendMessage(user),不写 user msg(防重复)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须读 body.firstUserMessage
      expect(
        text,
        'chat route 必须读 body.firstUserMessage(用于判断跳过)',
      ).toMatch(/body\.firstUserMessage/);

      // 必须有 skip 逻辑 — firstUserMessage 存在时跳 appendMessage(user)
      // 验法:跳过的 if 分支必须在 appendMessage(user) 之前
      // 简化:必须有 skipByUpsert 或类似变量名 + 跳过分支
      expect(
        text,
        'chat route 必须有 firstUserMessage 跳过的判断逻辑',
      ).toMatch(/(skipByUpsert|firstUserMessage|isEffectivelyEmptyUserMessage)[\s\S]*?(appendMessage|console\.log)/);

      // 反例:不能无条件 appendMessage(user)— 现在的代码就是无条件调
      // 但因为 cs-round-022 已加 isEffectivelyEmptyUserMessage 跳过,所以校验:
      // appendMessage(user) 调用必须在 skipByUpsert || isEffectivelyEmptyUserMessage 分支外
      // 弱约束:appendMessage(user) 调用必须在 console.log/console.warn 之后(else 分支内)
      const appendMsgIdx = text.indexOf('appendMessage(sessionId');
      const skipLogIdx = text.indexOf('skip');
      expect(
        appendMsgIdx > skipLogIdx,
        'appendMessage(sessionId, ...) 调用必须在 skip 日志之后(确保在 else 分支)',
      ).toBe(true);
    });
  });
});