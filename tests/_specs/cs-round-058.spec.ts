/**
 * @status implemented
 * @change-id cs-round-058
 * @incident-id (TBD)
 * @incident-date 2026-08-18
 * @root-cause cs-round-056 改 backend upsertSession 用 prisma.$transaction 包
 *   upsertSession + csMessage.create + messageCount +1。Prisma 在 MySQL
 *   REPEATABLE READ 下,把 upsert 翻译成「先 SELECT 后 INSERT/UPDATE」两步。
 *   两个并发事务(BFF /api/sessions/upsert + chat route 的 upsertSession
 *   都用同 sessionKey)都看不到对方未 commit 的 session,都尝试 create →
 *   第二个 P2002 unique constraint 失败 → 整个 tx rollback → user msg
 *   也丢失。prod session 66: cs_message 只有 user msg(id=74),没有
 *   assistant placeholder → AI 没回复。
 *
 *   真相:session 66 的 cs_session row 是第一次 createSession 成功创建的
 *   (BFF upsert 路由调的 backend upsertSession),user msg id=74 也在
 *   同一事务里写入了。**第二次** sendMessage 的 chat route 调
 *   upsertSession(同 sessionKey)→ P2002 → catch 进 sessionId=-1 →
 *   assistant placeholder 没写 → streamText 流跑完但 flushPatch 因
 *   sessionId <= 0 跳过 → cs_message 没有 assistant row。
 *
 * cs-round-058 修法:把 Prisma upsert 改成「findUnique + 显式分支
 *   create/update」,**在事务内 catch P2002 后 retry findUnique + update**
 *   (对方刚 commit)。MySQL 单事务内并发安全。
 *
 *   Out of scope:
 *   - chat route 与 BFF upsert 仍会有两次并发请求,但并发幂等 — findUnique 后
 *     命中已有 row → 走 update 分支
 *   - 跨进程的 race(分布式锁)超出 cs-round 范围
 *   - assistant placeholder 写失败的独立监控(暂不修,等生产数据积累再补)
 *
 * Spec 契约(代码契约 grep):
 *
 *   A. backend upsertSession **不能直接用** `prisma.csSession.upsert`(会被翻译
 *      成两步,REPEATABLE READ 内并发不安全)
 *   B. 必须在 $transaction 内用 `tx.csSession.findUnique` + 显式 create/update
 *      分支
 *   C. create 分支失败时必须 catch Prisma P2002 → retry findUnique + update
 *      (并发安全)
 *   D. assistant placeholder 路径(chat/route.ts)仍能正常 PATCH(契约 H,防回归)
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

describe('cs-round-058: backend upsertSession 并发安全(避免 $transaction 内 upsert P2002)', () => {
  describe('A + B + C. Given: erp-admin-backend internal.service.ts upsertSession', () => {
    it('Then: 必须用 tx.csSession.findUnique + 显式 create/update 分支,不能直接用 tx.csSession.upsert', () => {
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

      // 契约 A:事务内**不能**用 prisma.csSession.upsert(直接调用或在 tx 回调内调用)
      // 允许用 prisma.csSession.findUnique / /findFirst
      const usesUpsertInTx =
        /tx\.csSession\.upsert\s*\(/.test(body) ||
        /prisma\.csSession\.upsert\s*\(/.test(body);
      expect(
        !usesUpsertInTx,
        'upsertSession 不能用 prisma.csSession.upsert 或 tx.csSession.upsert(并发不安全)',
      ).toBe(true);

      // 契约 B:必须用 findUnique + create/update 分支
      expect(
        body,
        'upsertSession 必须在 tx 回调内用 tx.csSession.findUnique 查现有 session',
      ).toMatch(/tx\.csSession\.findUnique\s*\(\s*\{\s*where\s*:\s*\{\s*sessionKey/);
      expect(
        body,
        'upsertSession 必须显式 create 分支(tx.csSession.create)',
      ).toMatch(/tx\.csSession\.create\s*\(/);
      expect(
        body,
        'upsertSession 必须显式 update 分支(tx.csSession.update)',
      ).toMatch(/tx\.csSession\.update\s*\(/);

      // 契约 C:create 失败必须 catch P2002 + retry findUnique
      expect(
        body,
        'upsertSession create 分支必须 catch P2002(并发竞态)',
      ).toMatch(/P2002/);
    });
  });

  describe('D. Given: ai-cs-demo chat/route.ts assistant placeholder', () => {
    it('Then: assistant placeholder 创建逻辑必须保留(防回归)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // assistant placeholder 创建调用必须存在
      expect(
        text,
        'chat route 必须保留 assistant placeholder 创建逻辑(erp.appendMessage sessionId role=assistant status=2)',
      ).toMatch(/erp\.appendMessage\s*\(\s*sessionId[\s\S]*?role\s*:\s*['"]assistant['"][\s\S]*?status\s*:\s*2/);
    });
  });
});