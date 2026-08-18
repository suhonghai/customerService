/**
 * @status implemented
 * @change-id cs-round-057
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause cs-round-056 让 upsert 同步写首条 user msg 到 DB 后,prod 立即出现
 *   「点 1 次发送 → UI 显示 2 条相同 user msg」bug。
 *
 *   复现链路:
 *   1. RAGChat.send() → createSession({userMessage}) → upsert 路由 → backend
 *      prisma.csMessage.create(id=69, role=user, content="X")
 *   2. RAGChat.send() → sendMessage() → useChat 内部 push user msg(id="client-abc",
 *      role=user, content="X")
 *   3. upsert 返回 id=55 → onCommit → router.replace(/chat/55)
 *      → activeId 切到 backendId → useChatState useEffect 跑
 *   4. fetch /api/sessions/55/history → 拿到 cs_message id=69 → setMessages:
 *      localIds = {"client-abc"}, restored id="69" 不在 localIds → push 进 messages
 *   5. UI 显示: [client-abc, 69] = 2 条相同 user msg
 *
 *   旧去重 useChatState.ts:177-186 只按 `String(m.id)` 严格比对,client 生成 id 与
 *   DB 自增 id 永远不同 → 永远不去重。
 *
 * cs-round-057 修法:去重逻辑增加「content + role + 短时间窗口(10s)」二级去重。
 *   - 主去重仍按 id(精准,处理正常路径:DB id 与 client id 一致时)
 *   - 次去重按 content + role + 10s 窗口(兜底,处理 cs-round-056 引入的「DB 写入
 *     但 client id 与 DB id 不同步」竞态)
 *
 *   短窗口 10s 选择:用户两次手发同 content 概率极低;但 10s 内足以覆盖
 *   cs-round-056 整链路(upsert 200ms + onCommit 触发 + useEffect fetch /
 *   history 100ms + render),10s 后已稳定不再误判。
 *
 * Spec 契约(代码契约 grep,fs 读源码 + 正则):
 *
 *   A. use-chat-state.ts 的 /history refetch 去重 setMessages 调用必须**保留原
 *      id 去重**(spec 防回归,不能把原 id 比对删了)
 *   B. 同 setMessages 调用必须新增「content + role + 时间窗口」去重逻辑
 *   C. 时间窗口值取 10000ms(= 10s,可读性优先,精确值不强求但 spec 锁定 10000)
 *   D. content 比对必须 fallback parts 取 text(兼容 cs_message.content 直接存与
 *      parts 拆分两种 schema 形态;现有 schema content @db.Text 存全文,所以
 *      primary 比对用 m.content,parts 仅 fallback)
 *   E. assistant / system 消息也走同一去重(不只 user)— 但只有 user 会触发
 *      cs-round-056 这条路径,assistant 走 cs-round-011 / useAutoResumeStreaming
 *      链路本身有 id 同步(appendMessage 写的 msgId = assistant 的 placeId),
 *      不会撞到;为防御性,把 assistant / system 都纳入同一去重
 *   F. 反例:不能删 setMessages 的 id 比对 — 它仍是主路径;content 比对是
 *      兜底
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

describe('cs-round-057: useChatState /history refetch 按 content + 短窗口去重(修 cs-round-056 重复 user msg bug)', () => {
  describe('A + B + C + D. Given: ai-cs-demo use-chat-state.ts', () => {
    it('Then: /history refetch 的 setMessages 必须同时按 id + content+role+10s 窗口去重', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠 /history refetch 的 setMessages 调用块
      // 上下文:setMessages((prev) => { const localIds = ...; const newFromBackend = ...; return ...; });
      const refetchBlock = text.match(
        /setMessages\s*\(\s*\(\s*prev\s*\)\s*=>\s*\{[\s\S]*?const\s+localIds[\s\S]*?newFromBackend[\s\S]*?return\s+\[\.\.\.prev,\s*\.\.\.newFromBackend\][\s\S]*?\}\s*\)/,
      );
      expect(refetchBlock?.[0] ?? '', '/history refetch 的 setMessages 块必须存在').toBeTruthy();
      const body = refetchBlock![0];

      // 契约 A:必须保留 id 比对(localIds.has / !localIds.has 之类)
      // 宽松断言:两种写法都允许 — `if (localIds.has(...)) return false`(正向)
      // 或 `!localIds.has(...)`(反向)
      expect(
        body,
        '/history refetch 必须保留 id 比对去重(防回归)',
      ).toMatch(/localIds\.has\s*\(\s*String\s*\(\s*m\.id\s*\)/);

      // 契约 B + C:必须新增 content+role+时间窗口去重
      // 验法:必须有「10s/10000ms」+ content 比对 + role 比对
      // 时间窗口(宽松匹配 10s / 10000 / 10_000)
      expect(
        body,
        '/history refetch 必须有时间窗口去重(10s 兜底,防 cs-round-056 重复)',
      ).toMatch(/10000|10\s*\*\s*1000|10_000/);

      expect(
        body,
        '/history refetch 必须按 content 比对去重(同内容视同一条)',
      ).toMatch(/m\.content|\.content/);

      expect(
        body,
        '/history refetch 必须按 role 比对去重(user/assistant 都覆盖)',
      ).toMatch(/role/);

      // 契约 D:content 比对必须 fallback 到 parts 取 text
      // 弱断言:有 .parts 字段访问(说明做了 fallback)
      expect(
        body,
        '/history refetch 必须 fallback 到 parts 取 text(兼容 schema 形态)',
      ).toMatch(/\.parts/);

      // 契约 F(反例):必须同时保留 id 去重 —— body 已包含 localIds.has(...) 匹配
      // 这里只是再次显式断言:不能删 localIds
      expect(
        body,
        '/history refetch 不能删 id 比对(主路径仍按 id)',
      ).toMatch(/localIds/);

      // 时间窗口内比对逻辑必须有 createdAt 比较(否则只是「全局同 content」误杀)
      expect(
        body,
        '/history refetch 必须按 createdAt 时间窗口比对(短窗口内才算重复)',
      ).toMatch(/createdAt|getTime\s*\(\s*\)|Date\.now/);
    });
  });
});