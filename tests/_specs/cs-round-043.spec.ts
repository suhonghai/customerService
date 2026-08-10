/**
 * @status implemented
 * @change-id cs-round-043
 * @incident-id T-20260810007
 * @incident-date 2026-08-10
 * @root-cause ai-cs 用户点 AI 消息 👍/👎 按钮,UI 显示「已记录到 localStorage」— 但
 *   **只写 localStorage**,后端 DB 没存。换浏览器 / 清缓存 → 评分全丢,运营看不到
 *   用户对哪条 AI 消息满意 / 不满意,F6「数据驱动迭代」目标形同虚设。
 *
 *   RatingButtons.tsx 注释明说"评分是局部 UI 状态(localStorage 是单一来源)",
 *   是 Day 8 F6 时的妥协。后端 csSession.rating 列空着(UI 是 per-message 不是
 *   per-session,逻辑错位)。
 *
 * cs-round-043 走正经 PATCH 路径(per-message 落 csMessage.metadata.rating):
 *   - 后端新增 PATCH /api/internal/cs/sessions/:id/messages/:msgId/rating
 *     service 内部 merge metadata(不覆盖现有 lastChunkType / source 等)
 *   - BFF /api/cs/sessions/[sessionId]/messages/[msgId]/rating/route.ts
 *   - ai-cs erp-admin-client.rateMessage 走 BFF 相对路径(同 cs-round-042 修法)
 *   - RatingButtons.set() 加 backend 同步(fire-and-forget),失败 console.warn
 *     (localStorage 已是缓存,数据不丢)
 *
 * Spec 契约(代码契约 grep,fs 读源码 + 正则):
 *
 *   A. backend controller 有 @Patch('sessions/:id/messages/:msgId/rating')
 *      + 调 this.internalService.rateMessage
 *   B. backend service rateMessage 用 prisma.csMessage.findFirst({where:
 *      {id:msgId, sessionId}}) IDOR 校验 + update({data:{metadata: merged}})
 *      (merged 必须 spread existingMeta + 写入 rating + ratedAt + source:'user-rating')
 *   C. backend DTO RateMessageDto.rating 有 @IsIn([1, -1]) + 可选 ratingText
 *      @MaxLength(500)
 *   D. BFF /api/cs/sessions/[sessionId]/messages/[msgId]/rating/route.ts 文件存在
 *      + PATCH + 转发到 /api/internal/cs/sessions/.../messages/.../rating + 带
 *      X-Internal-Token
 *   E. ai-cs erp-admin-client.rateMessage 走 BFF 相对路径
 *      /api/cs/sessions/${sessionId}/messages/${msgId}/rating + PATCH — 反例:
 *      不走 this.request(防 cs-round-038/039/042 token undefined bug 重现)
 *   F. RatingButtons.set() 调 getErpAdminClient().rateMessage(...) — 反例:
 *      不能留旧「only localStorage」(防 F6 妥协回流)
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

describe('cs-round-043: 消息评分持久化(per-message 落 csMessage.metadata)', () => {
  // ── 契约 A:backend controller 有 PATCH message rating 路由 ──
  describe('A. Given: erp-admin-backend internal.controller.ts', () => {
    it('Then: 必须有 @Patch("sessions/:id/messages/:msgId/rating") + 调 rateMessage', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.controller.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'controller 必须有 @Patch("sessions/:id/messages/:msgId/rating") 路由',
      ).toMatch(
        /@Patch\(['"]sessions\/:id\/messages\/:msgId\/rating['"]\)/,
      );

      expect(
        text,
        'controller 必须有 rateMessage handler',
      ).toMatch(/async\s+rateMessage\s*\(/);

      expect(
        text,
        'controller 必须调 this.internalService.rateMessage',
      ).toMatch(/this\.internalService\.rateMessage\s*\(/);
    });
  });

  // ── 契约 B:backend service rateMessage 实现 ──
  describe('B. Given: erp-admin-backend internal.service.ts rateMessage', () => {
    it('Then: 必须 findFirst by id+sessionId(IDOR) + update metadata merged', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(text, 'service 必须有 async rateMessage 方法').toMatch(
        /async\s+rateMessage\s*\([\s\S]*?\)\s*\{/,
      );

      // 必须 IDOR 校验:findFirst where id=msgId AND sessionId=sessionId
      // sessionId 是最后一个 key,后面跟 `}` 不是 `:`(无值)
      expect(
        text,
        'service 必须 prisma.csMessage.findFirst({where:{id:msgId, sessionId}}) IDOR 校验',
      ).toMatch(
        /prisma\.csMessage\.findFirst\s*\(\s*\{[\s\S]*?where\s*:\s*\{\s*id\s*:\s*msgId\s*,\s*sessionId\s*[},]/,
      );

      // 必须 spread existingMeta(merge,不覆盖)
      expect(
        text,
        'service 必须 spread existingMeta(merge 不覆盖现有 metadata)',
      ).toMatch(/\.\.\.existingMeta/);

      // 必须写入 rating 字段
      expect(
        text,
        'service 必须把 dto.rating 写进 merged metadata',
      ).toMatch(/rating\s*:\s*dto\.rating/);

      // 必须写入 source: 'user-rating'(对齐 ack 范式)
      expect(
        text,
        "service 必须写 source: 'user-rating'(对齐 cs-round-040 metadata.source 范式)",
      ).toMatch(/source\s*:\s*['"]user-rating['"]/);

      // 必须写入 ratedAt 时间戳
      expect(
        text,
        'service 必须写 ratedAt 时间戳(new Date().toISOString())',
      ).toMatch(/ratedAt\s*:\s*new Date\(\)\.toISOString\(\)/);

      // 最后 prisma.csMessage.update({data:{metadata: merged}})
      expect(
        text,
        'service 必须 prisma.csMessage.update({data:{metadata: merged}})',
      ).toMatch(
        /prisma\.csMessage\.update\s*\(\s*\{[\s\S]*?data\s*:\s*\{[\s\S]*?metadata\s*:\s*merged/,
      );
    });
  });

  // ── 契约 C:backend DTO RateMessageDto 字段校验 ──
  describe('C. Given: erp-admin-backend rate-message.dto.ts', () => {
    it('Then: RateMessageDto.rating 必须 @IsIn([1, -1]) + ratingText 可选 @MaxLength(500)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/dto/rate-message.dto.ts',
      );
      expect(existsSync(p), 'RateMessageDto 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(text, 'DTO 必须 export RateMessageDto class').toMatch(
        /export\s+class\s+RateMessageDto/,
      );

      // rating 字段必须有 @IsIn([1, -1])
      // 装饰器在字段上方,用整 file text 断言即可(无需抠 span)
      expect(text, 'DTO 必须有 rating 字段声明').toMatch(/rating\s*!?\s*:\s*number/);
      expect(text, 'rating 字段必须有 @IsIn([1, -1]) 装饰器').toMatch(
        /@IsIn\s*\(\s*\[\s*1\s*,\s*-1\s*\]\s*\)/,
      );

      // ratingText 可选 @MaxLength(500)
      expect(text, 'ratingText 必须有 @MaxLength(500) 装饰器').toMatch(
        /@MaxLength\s*\(\s*500\s*\)/,
      );
      expect(
        text,
        'ratingText 必须有 @IsOptional + @IsString',
      ).toMatch(/@IsOptional\s*\(\s*\)/);
    });
  });

  // ── 契约 D:BFF rating route 文件存在 + 转发 ──
  describe('D. Given: ai-cs-demo BFF /api/cs/sessions/[sessionId]/messages/[msgId]/rating/route.ts', () => {
    it('Then: 必须有 PATCH handler + 转发到 backend + 带 X-Internal-Token', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/app/api/cs/sessions/[sessionId]/messages/[msgId]/rating/route.ts',
      );
      expect(existsSync(p), 'BFF rating route 文件必须存在').toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(text, 'BFF rating 必须 export async function PATCH').toMatch(
        /export\s+async\s+function\s+PATCH/,
      );

      expect(
        text,
        'BFF rating 必须 server-side 用 process.env.INTERNAL_TOKEN',
      ).toMatch(/process\.env\.INTERNAL_TOKEN/);

      // 必须转发到 backend /api/internal/cs/sessions/.../messages/.../rating
      expect(
        text,
        'BFF rating 必须转发到 backend /api/internal/cs/sessions/.../messages/.../rating',
      ).toMatch(
        /\/api\/internal\/cs\/sessions\/[\s\S]*?messages\/[\s\S]*?rating/,
      );

      expect(text, 'BFF rating 必须用 PATCH method').toMatch(
        /method\s*:\s*['"]PATCH['"]/,
      );
      expect(text, 'BFF rating 必须带 X-Internal-Token header').toMatch(
        /['"]X-Internal-Token['"]\s*:\s*INTERNAL_TOKEN/,
      );
    });
  });

  // ── 契约 E:ai-cs erp-admin-client.rateMessage 走 BFF 相对路径 ──
  describe('E. Given: ai-cs-demo erp-admin-client.ts rateMessage', () => {
    it('Then: 必须直 fetch BFF 相对路径 + PATCH(反例:不走 this.request 防 token undefined)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/erp-admin-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const method = text.match(
        /async\s+rateMessage\s*\([\s\S]*?\)\s*\{[\s\S]*?\n\s{2}\}/,
      );
      expect(method?.[0] ?? '', 'rateMessage 方法必须存在').toBeTruthy();
      const body = method![0];

      // 必须 fetch BFF 浏览器相对路径
      expect(
        body,
        'rateMessage 必须 fetch BFF 相对路径 /api/cs/sessions/${sessionId}/messages/${msgId}/rating',
      ).toMatch(
        /\/api\/cs\/sessions\/[\s\S]*?messages\/[\s\S]*?rating/,
      );

      expect(
        body,
        'rateMessage 必须用 PATCH method',
      ).toMatch(/method\s*:\s*['"]PATCH['"]/);

      expect(
        body,
        'rateMessage body 必须 JSON.stringify({ rating })',
      ).toMatch(/JSON\.stringify\s*\(\s*\{\s*rating/);

      expect(
        body,
        'rateMessage 不能走 this.request(浏览器端 token undefined → 抛错)',
      ).not.toMatch(/this\.request\s*[<(]/);
    });
  });

  // ── 契约 F:RatingButtons.set() 调 erp.rateMessage ──
  describe('F. Given: ai-cs-demo RatingButtons.tsx set()', () => {
    it('Then: 必须调 getErpAdminClient().rateMessage(...)(反例:不留 only localStorage)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/RatingButtons.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 getErpAdminClient().rateMessage(...) 调用
      expect(
        text,
        'RatingButtons.set() 必须调 getErpAdminClient().rateMessage(...) 同步到后端',
      ).toMatch(/getErpAdminClient\s*\(\s*\)\s*\.rateMessage\s*\(/);

      // 必须有 fire-and-forget .catch(console.warn) 失败兜底
      expect(
        text,
        'RatingButtons 失败必须有 .catch(console.warn) 兜底(localStorage 已存不报错)',
      ).toMatch(/\.catch\s*\([\s\S]*?console\.warn/);
    });
  });
});