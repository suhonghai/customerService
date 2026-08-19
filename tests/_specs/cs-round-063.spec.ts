/**
 * @status implemented
 * @change-id cs-round-063
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause cs-round-062 部署后,prod session 105 刷新进入,Network 面板
 *   看到续推 /api/chat 请求已触发(EventStream start chunk 出来),但 AI
 *   报 AI_NoOutputGeneratedError,气泡仍空。
 *
 *   根因:use-auto-resume-streaming.ts:144-162 的 resumeOne 一直发合成空
 *   user 消息 `{id: 'm_continue_${id}', role: 'user', parts: [{type:'text', text:''}]}`
 *   作为 body.messages。这是从 cs-round-011 一路传承的 hack — 当时 chat/route.ts
 *   强制要求非空 messages/message,否则 400。cs-round-011 时代续推只可能走
 *   status=2 in-flight 转发路径(cs-round-026),LLM 用的是原 streamText 的
 *   上下文,合成空消息只作为"resume 信号"骗过 400 校验,从不真正进 LLM。
 *
 *   cs-round-062 暴露了底层 bug:status=4 续推走 fallthrough(原 streamText
 *   已挂,inFlight 已清)→ 重新 buildStream → 合成空消息**真的**被传给 LLM
 *   → LLM 拿不到用户问题 → 0 chunk → AI_NoOutputGeneratedError。
 *
 * cs-round-063 修法(架构清理,不只补 bug):
 *   A. 真正的"resume 信号"是 `continueFromMessageId`,不是合成空 user 消息。
 *      后端 payload 校验放宽:`continueFromMessageId > 0` 时允许空 messages。
 *   B. chat/route.ts 续推分支从 DB 加载**完整**会话上下文(从 session 第一条
 *      消息到 failed assistant 之前的所有 user/assistant),构造 messages 喂给
 *      streamText。多轮对话也能 work(后续 user-assistant 链完整)。
 *   C. queryText 也从 DB 加载的原 user 消息重新计算 — RAG retrieval 拿正确查询。
 *   D. chat/route.ts appendMessage(user) 逻辑加 skipByResume 跳过(替代
 *      isEffectivelyEmptyUserMessage 判断)— user msg 已在 DB,不能重复写。
 *   E. use-auto-resume-streaming.ts:body 不再发 messages 字段,只发
 *      continueFromMessageId + 上下文(successor of cs-round-022 合成空消息 hack)。
 *   F. 删除/简化 chat/route.ts 续推分支对 isEffectivelyEmptyUserMessage 的依赖
 *      (现在 skipByResume 是更精确的判断,isEffectivelyEmptyUserMessage 保留
 *      作 defense-in-depth 兜底)。
 *
 *   Out of scope:
 *   - 改 isEffectivelyEmptyUserMessage 函数本身 — 保留作 defense-in-depth
 *   - 改 front-end useChat 的 sendMessage 行为(只动 hook 的 resume 分支)
 *   - 多 assistant 并发续推(同 session 同时多 placeholder 失败)— 超出范围
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

describe('cs-round-063: 续推从 DB 加载原 user 消息作 LLM context(替代合成空消息 hack)', () => {
  describe('A. 后端 chat/route.ts payload 校验放宽', () => {
    it('Then: continueFromMessageId > 0 时必须允许空 messages(不返 400)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 A.1:payload 校验块必须包含「continueFromMessageId > 0 时放行」分支
      // 模式:在 `if (Array.isArray(body.messages)...) else if (typeof body.message...) else {...}`
      // 链中加一个 `else if (continueFromMessageId > 0) { messages = []; }` 分支
      expect(
        text,
        'chat/route.ts payload 校验必须放宽:continueFromMessageId > 0 时允许空 messages',
      ).toMatch(
        /else\s+if\s*\(\s*typeof\s+body\.continueFromMessageId\s*===\s*['"]number['"]\s*&&\s*body\.continueFromMessageId\s*>\s*0\s*\)/,
      );
    });
  });

  describe('B. 续推分支从 DB 加载完整上下文', () => {
    it('Then: chat/route.ts 续推分支必须调 getSessionMessages + findIndex 定位', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.1:必须调 getSessionMessages(sessionId) 拉完整会话消息
      expect(
        text,
        '续推分支必须调 erp.getSessionMessages 加载完整上下文',
      ).toMatch(/erp\.getSessionMessages\s*\(\s*sessionId\s*\)/);

      // 契约 B.2:必须有 findIndex(assistantId) 找 failed assistant 位置
      expect(
        text,
        '续推分支必须用 findIndex 定位 failed assistant 在消息列表里的位置',
      ).toMatch(/sessionMsgs\.findIndex\s*\(/);

      // 契约 B.3:必须取该位置之前的消息作为 LLM context(slice)
      expect(
        text,
        '续推分支必须 slice(0, assistantIdx) 取 failed assistant 之前的所有消息',
      ).toMatch(/sessionMsgs\.slice\s*\(\s*0\s*,\s*assistantIdx\s*\)/);

      // 契约 B.4:必须用 lastUserInContext 反向找 user msg 重算 queryText
      expect(
        text,
        '续推分支必须从加载的 context 里找最后一条 user 消息重算 queryText',
      ).toMatch(/lastUserInContext/);
    });

    it('Then: queryText 必须能从 DB 加载的原 user 消息重算(让 RAG retrieval 拿正确查询)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 B.5:queryText 声明必须是 let(允许重赋值)
      // — 因为续推时需要从 DB 加载后重算
      // 不能是 const(原 line 334 是 const 锁住)
      expect(
        text,
        'queryText 必须从 const 改为 let(允许续推时重算)',
      ).toMatch(/let\s+queryText/);
    });
  });

  describe('C. appendMessage(user) 跳过续推', () => {
    it('Then: chat/route.ts 必须有 skipByResume 跳过 appendMessage(user)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 C.1:必须有 skipByResume 变量定义 + 使用
      // 位置:appendMessage 块(line 376-394 区域),在 skipByUpsert 后
      // isEffectivelyEmptyUserMessage 之前
      expect(
        text,
        'appendMessage 块必须加 skipByResume 判断(continueFromMessageId > 0 时跳过)',
      ).toMatch(/skipByResume\s*=\s*typeof\s+body\.continueFromMessageId\s*===\s*['"]number['"]\s*&&\s*body\.continueFromMessageId\s*>\s*0/);

      // 契约 C.2:必须用 skipByResume 作为 appendMessage if 分支条件
      expect(
        text,
        'appendMessage 块必须用 skipByResume 作跳过条件',
      ).toMatch(/else\s+if\s*\(\s*skipByResume\s*\)/);
    });
  });

  describe('E. 前端 hook 不再发合成空 user 消息', () => {
    it('Then: useAutoResumeStreaming fetch body 不应再发 messages 字段', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约 E.1:fetch body 不能再有 messages: [{ id: m_continue_..., text: '' }]
      // (cs-round-011 时代的合成空消息 hack)
      expect(
        text,
        'resumeOne fetch body 不能含合成空 user 消息(已删,cs-round-063)',
      ).not.toMatch(/messages\s*:\s*\[\s*\{[^}]*m_continue_/);
    });
  });

  describe('F. 回归保护', () => {
    it('Then: status=2 in-flight 转发路径不被破坏(cs-round-026)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 回归契约:inFlightGenerations.get + tee + drainForever + writer.merge 三件套
      // 必须在(防 cs-round-026 路径被改坏)
      expect(
        text,
        'cs-round-026 inFlight.stream.tee 路径必须保留(回归)',
      ).toMatch(/inFlight\.stream\.tee\s*\(/);
      expect(
        text,
        'cs-round-026 drainForever bg 分支必须保留(回归)',
      ).toMatch(/drainForever\s*\(\s*resumeBgStream\s*\)/);
      expect(
        text,
        'cs-round-026 writer.merge client 分支必须保留(回归)',
      ).toMatch(/writer\.merge\s*\(\s*resumeClientStream\s*\)/);
    });

    it('Then: cs-round-060 v2/v3 claim 逻辑不被破坏', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 回归契约:v2 claim 块 + v3 self-await 防御必须有
      expect(
        text,
        'cs-round-060 v2 claim 块必须保留(回归)',
      ).toMatch(/cs-round-060 v2 claim/);

      // v3:myResolver 引用比对(防自等死锁)
      const v3Matches = text.match(
        /streamReadyResolvers\.get\([^)]+\)\s*!==\s*\w+Resolver/g,
      );
      expect(
        v3Matches && v3Matches.length >= 2,
        'cs-round-060 v3 self-await 防御必须保留 2 处(续推 + else 分支,回归)',
      ).toBe(true);
    });
  });
});
