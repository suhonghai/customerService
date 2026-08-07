/**
 * @status implemented
 * @change-id cs-round-030
 *
 * cs-round-030:Next.js WS 鉴权 env 对齐 — 根 .env.example 必须镜像
 * NEXT_PUBLIC_INTERNAL_TOKEN(否则新部署 / 新开发者 ai-cs 端 WS 鉴权失败,
 * 客服消息需刷新才看到)。
 *
 * Why:
 *   cs-round-029 修了 ai-cs-demo `.env.example` 模板,但根 `.env.example`(影响
 *   docker-compose 多环境编排 + 新 onboarding 流程)遗漏了 NEXT_PUBLIC_INTERNAL_TOKEN。
 *   Next.js 的 `NEXT_PUBLIC_*` 是 build-time 注入,**不会**自动从根 INTERNAL_TOKEN 派生,
 *   必须显式设值,且与 INTERNAL_TOKEN 完全一致。
 *
 *   历史上 cs-round-007 加了 realtime-client.ts 代码引用,cs-round-029 修了 ai-cs-demo
 *   .env.example 模板,但根 .env.example + 实际开发/部署 env 一直没补这一行,导致
 *   ai-cs WS 鉴权失败 → onMessage 不触发 → 用户刷新页面才能看到客服消息。
 *
 * Spec 契约(根 spec,代码契约 grep):
 *
 *   A. 根 .env.example 必须含 `NEXT_PUBLIC_INTERNAL_TOKEN=` 行(非空),
 *      且该行与 `INTERNAL_TOKEN=` 值在同一文件内字符串等价
 *      (Next.js build-time 字面量替换必须字面相同)。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

describe('cs-round-030: 根 .env.example NEXT_PUBLIC_INTERNAL_TOKEN 镜像契约', () => {
  it('Then: 根 .env.example 必须有 NEXT_PUBLIC_INTERNAL_TOKEN= 行(非空)', () => {
    const p = resolve(ROOT, '.env.example');
    expect(existsSync(p), '根 .env.example 必须存在(入仓)').toBe(true);

    const text = readFileSync(p, 'utf-8');
    const lineMatch = text.match(
      /^\s*NEXT_PUBLIC_INTERNAL_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/m,
    );
    expect(
      lineMatch?.[1] ?? '',
      '根 .env.example 必须含 NEXT_PUBLIC_INTERNAL_TOKEN= 行(Next.js build-time 注入用,'
        + 'WS 握手鉴权凭据)',
    ).toBeTruthy();
    expect(
      (lineMatch?.[1] ?? '').trim().length,
      'NEXT_PUBLIC_INTERNAL_TOKEN 值不可为空(占位符 please-generate 是允许的)',
    ).toBeGreaterThan(0);
  });

  it('Then: NEXT_PUBLIC_INTERNAL_TOKEN 的占位值应与 INTERNAL_TOKEN 占位值一致(同源镜像)', () => {
    const p = resolve(ROOT, '.env.example');
    const text = readFileSync(p, 'utf-8');

    const internalMatch = text.match(/^\s*INTERNAL_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/m);
    const nextPublicMatch = text.match(
      /^\s*NEXT_PUBLIC_INTERNAL_TOKEN\s*=\s*"?([^"\n]+)"?\s*$/m,
    );

    expect(internalMatch?.[1] ?? '', '必须含 INTERNAL_TOKEN= 行').toBeTruthy();
    expect(
      nextPublicMatch?.[1] ?? '',
      '必须含 NEXT_PUBLIC_INTERNAL_TOKEN= 行',
    ).toBeTruthy();

    expect(
      (nextPublicMatch?.[1] ?? '').trim(),
      'NEXT_PUBLIC_INTERNAL_TOKEN 占位必须与 INTERNAL_TOKEN 占位同源镜像'
        + '(避免开发者后续分别替换两份值导致不一致)',
    ).toBe((internalMatch?.[1] ?? '').trim());
  });
});