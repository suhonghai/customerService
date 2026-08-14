/**
 * @status draft
 * @change-id cs-round-055
 * // @cross-package: ai-cs,backend
 *
 * cs-round-055:createSession 必须绑定登录用户,不再产生"孤儿 session"
 * (cs_session.user_id=NULL AND customer_id=NULL)
 *
 * Why:
 *   ai-cs-demo/src/hooks/use-sessions.ts:createSession() 调
 *   POST /api/sessions/upsert 时,body 只传 sessionKey / visitorId / title,
 *   **不传 userId / customerId**。后端 upsertSession 收到 undefined 时
 *   `...(dto.userId !== undefined ? { userId: dto.userId } : {})` 跳过赋值,
 *   入库 cs_session.user_id=NULL, customer_id=NULL。
 *
 *   后果:
 *   - 已登录用户创建的 session 看起来是"匿名孤儿"
 *   - list 接口按 userId=CsCustomer.id 过滤时,孤儿全部被滤掉
 *   - 用户体验:点"+ 新会话"后,sidebar 不刷新,新会话"消失"
 *     (实际在 DB,但 list 查不到)
 *
 * Spec 契约(代码契约 grep + 路径断言):
 *
 *   A. ai-cs-demo/src/hooks/use-sessions.ts 的 createSession() 内
 *      fetch('/api/sessions/upsert', { body: JSON.stringify({ ... }) })
 *      必须包含 userId / customerId 字段(从 getClientUserId() / getClientCustomerId())。
 *
 *   B. 同文件 renameSession() 内 fetch('/api/sessions/upsert', ...) 也必须带
 *      userId / customerId(命名风格可能跟 createSession 不同,但要落库要补)。
 *
 *   C. ai-cs-demo/src/app/api/sessions/upsert/route.ts 必须把 body.userId /
 *      body.customerId 透传给 getErpAdminClient().upsertSession(...) 调用。
 *      (当前实现已经接 body.userId,但 body.customerId 字段被忽略,必须补上。)
 *
 *   D. erp-admin-backend/src/modules/internal/internal.service.ts 的
 *      upsertSession(dto) 必须把 dto.userId / dto.customerId 写入
 *      cs_session.user_id / cs_session.customer_id(已有逻辑;锁定防回归)。
 *
 * Out of scope:
 *   - BFF /api/customer/sessions/list 改造:本期不修(用户明确"按用户查,
 *     不按 visitorId 查")。list 维持 userId-only 过滤。
 *   - 已存在孤儿 session 的数据修复 / 删除:本期只锁契约,数据清理走 SQL 脚本
 *     (见 production cleanup)。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤注释行(同 cs-round-026 / 028 / 029 / 031)
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

/** 抠出 createSession 的 callback body(createSession: useCallback((opts?) => { ... }, []) 内) */
function extractCreateSessionBody(text: string): string {
  // createSession = useCallback((opts?: {...}) => { ... }, [])
  const m = text.match(/createSession\s*=\s*useCallback\s*\(/);
  if (!m || m.index === undefined) return '';
  // 抠到 useCallback 的尾部 `}, [])`
  const startIdx = m.index;
  const endMatch = text.slice(startIdx).match(/\}\s*,\s*\[\s*\]\s*\)/);
  if (!endMatch || endMatch.index === undefined) return '';
  return text.slice(startIdx, startIdx + endMatch.index + 1);
}

/** 抠出 updateActiveSession 的 callback body —— 用 brace counter 抠到 useCallback 结束 */
function extractUpdateActiveSessionBody(text: string): string {
  const m = text.match(/updateActiveSession\s*=\s*useCallback\s*\(/);
  if (!m || m.index === undefined) return '';
  const startIdx = m.index;
  let depth = 0;
  let started = false;
  let i = startIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      depth++;
      started = true;
    } else if (ch === '}') {
      depth--;
      if (started && depth === 0) {
        // useCallback 闭合后还有 `, [])` 跳过
        while (i < text.length && text[i] !== ')') i++;
        break;
      }
    }
    i++;
  }
  return text.slice(startIdx, i + 1);
}

describe('cs-round-055: createSession 必须绑定登录用户(防孤儿 session)', () => {
  // ── 契约 A:use-sessions.ts createSession fetch body 必须含 userId/customerId ──
  describe('Given: ai-cs-demo/src/hooks/use-sessions.ts 的 createSession', () => {
    const HOOK = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');

    it('Then: 必须 import getClientUserId + getClientCustomerId', () => {
      expect(existsSync(HOOK)).toBe(true);
      const text = stripComments(readFileSync(HOOK, 'utf-8'));

      // 必须有 import 引用(可以是 import { ... } from '@/lib/auth' 或同模块)
      expect(
        text,
        'use-sessions.ts 必须 import getClientUserId(C 端绑定用)',
      ).toMatch(/import\s*\{[^}]*\bgetClientUserId\b[^}]*\}/);
      expect(
        text,
        'use-sessions.ts 必须 import getClientCustomerId(C 端 CsCustomer.id 绑定用)',
      ).toMatch(/import\s*\{[^}]*\bgetClientCustomerId\b[^}]*\}/);
    });

    it('Then: createSession 内的 fetch body 必须包含 userId + customerId 字段', () => {
      const text = stripComments(readFileSync(HOOK, 'utf-8'));
      const body = extractCreateSessionBody(text);
      expect(body, 'createSession useCallback 体必须可定位').not.toBe('');

      // fetch('/api/sessions/upsert', { body: JSON.stringify({ ... }) }) 块
      const upsertCall = body.match(
        /fetch\s*\(\s*['"`]\/api\/sessions\/upsert['"`][\s\S]*?JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)/,
      );
      expect(
        upsertCall?.[0] ?? '',
        'createSession 必须有 fetch /api/sessions/upsert 调用',
      ).toBeTruthy();

      const fetchBodyObj = upsertCall![1];
      // 必须有 userId 字段
      expect(
        fetchBodyObj,
        'createSession fetch body 必须含 userId 字段(否则后端 upsertSession 不会写 user_id)',
      ).toMatch(/\buserId\s*:/);
      // 必须有 customerId 字段
      expect(
        fetchBodyObj,
        'createSession fetch body 必须含 customerId 字段(C 端账号必须落 cs_session.customer_id)',
      ).toMatch(/\bcustomerId\s*:/);

      // 进一步:userId 的值必须来自 getClientUserId()(不能写死 / 用错的 getter)
      expect(
        fetchBodyObj,
        'createSession fetch body.userId 必须调用 getClientUserId()',
      ).toMatch(/userId\s*:\s*getClientUserId\s*\(\s*\)/);
      // customerId 同理
      expect(
        fetchBodyObj,
        'createSession fetch body.customerId 必须调用 getClientCustomerId()',
      ).toMatch(/customerId\s*:\s*getClientCustomerId\s*\(\s*\)/);
    });
  });

  // ── 契约 B:updateActiveSession 派生 title 时的 fetch /api/sessions/upsert 也必须含 userId/customerId ──
  describe('Given: ai-cs-demo/src/hooks/use-sessions.ts 的 updateActiveSession(派生 title 后 fire-and-forget 调 upsert)', () => {
    const HOOK = resolve(ROOT, 'ai-cs-demo/src/hooks/use-sessions.ts');

    it('Then: updateActiveSession 内的 fetch /api/sessions/upsert body 也必须含 userId + customerId', () => {
      const text = stripComments(readFileSync(HOOK, 'utf-8'));
      const body = extractUpdateActiveSessionBody(text);
      expect(body, 'updateActiveSession useCallback 体必须可定位').not.toBe('');

      const upsertCall = body.match(
        /fetch\s*\(\s*['"`]\/api\/sessions\/upsert['"`][\s\S]*?JSON\.stringify\s*\(\s*\{([\s\S]*?)\}\s*\)/,
      );
      expect(
        upsertCall?.[0] ?? '',
        'updateActiveSession 必须有 fetch /api/sessions/upsert 调用',
      ).toBeTruthy();

      const fetchBodyObj = upsertCall![1];
      expect(
        fetchBodyObj,
        'updateActiveSession fetch body 必须含 userId(防回归:之前漏传)',
      ).toMatch(/\buserId\s*:/);
      expect(
        fetchBodyObj,
        'updateActiveSession fetch body 必须含 customerId(防回归:之前漏传)',
      ).toMatch(/\bcustomerId\s*:/);
    });
  });

  // ── 契约 C:/api/sessions/upsert route 必须透传 customerId ──
  describe('Given: ai-cs-demo/src/app/api/sessions/upsert/route.ts', () => {
    const ROUTE = resolve(
      ROOT,
      'ai-cs-demo/src/app/api/sessions/upsert/route.ts',
    );

    it('Then: route 必须把 body.userId 透传给 upsertSession(已有逻辑,锁定防回归)', () => {
      expect(existsSync(ROUTE)).toBe(true);
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));
      expect(
        text,
        '/api/sessions/upsert 必须把 body.userId 透传给 getErpAdminClient().upsertSession',
      ).toMatch(/userId\s*:\s*(?:typeof\s+body\.userId\s*===\s*['"`]number['"`]\s*\?\s*body\.userId\s*:\s*undefined|body\.userId)/);
    });

    it('Then: route 必须新增 body.userId 之外**也**透传 body.customerId(C 端账号落库关键)', () => {
      const text = stripComments(readFileSync(ROUTE, 'utf-8'));
      // 透传形式允许两种:typeof ... ? ... : undefined(防 null 漏),或直接 body.customerId
      expect(
        text,
        '/api/sessions/upsert 必须把 body.customerId 透传给 upsertSession(否则 C 端账号永远写不进 cs_session.customer_id)',
      ).toMatch(/customerId\s*:\s*(?:typeof\s+body\.customerId\s*===\s*['"`]number['"`]\s*\?\s*body\.customerId\s*:\s*undefined|body\.customerId)/);
    });
  });

  // ── 契约 D:后端 upsertSession 必须把 userId/customerId 写 cs_session ──
  describe('Given: erp-admin-backend/src/modules/internal/internal.service.ts 的 upsertSession', () => {
    const SVC = resolve(
      ROOT,
      'erp-admin-backend/src/modules/internal/internal.service.ts',
    );

    it('Then: upsertSession update 分支必须条件性写 userId(dto.userId !== undefined 才写)', () => {
      expect(existsSync(SVC)).toBe(true);
      const text = stripComments(readFileSync(SVC, 'utf-8'));

      // 找 upsertSession 的 update: { ... } 块
      const updateBlock = text.match(/update\s*:\s*\{([\s\S]*?)\}\s*,\s*create\s*:/);
      expect(
        updateBlock?.[0] ?? '',
        'upsertSession 必须有 update 分支',
      ).toBeTruthy();

      expect(
        updateBlock![1],
        'update 分支必须条件性写 userId(dto.userId !== undefined 才赋值)',
      ).toMatch(/dto\.userId\s*!==\s*undefined\s*\?\s*\{\s*userId\s*:\s*dto\.userId/);
    });

    it('Then: upsertSession update 分支必须条件性写 customerId', () => {
      const text = stripComments(readFileSync(SVC, 'utf-8'));
      const updateBlock = text.match(/update\s*:\s*\{([\s\S]*?)\}\s*,\s*create\s*:/);
      expect(updateBlock?.[0] ?? '').toBeTruthy();

      expect(
        updateBlock![1],
        'update 分支必须条件性写 customerId(dto.customerId !== undefined 才赋值)',
      ).toMatch(/dto\.customerId\s*!==\s*undefined\s*\?\s*\{\s*customerId\s*:\s*dto\.customerId/);
    });

    it('Then: upsertSession create 分支也必须条件性写 userId + customerId', () => {
      const text = stripComments(readFileSync(SVC, 'utf-8'));
      // create: { ... } 块(update 之后)
      const createBlock = text.match(/create\s*:\s*\{([\s\S]*?)\}\s*\}/);
      expect(
        createBlock?.[0] ?? '',
        'upsertSession 必须有 create 分支',
      ).toBeTruthy();

      expect(
        createBlock![1],
        'create 分支必须条件性写 userId(新建会话要带)',
      ).toMatch(/dto\.userId\s*!==\s*undefined\s*\?\s*\{\s*userId\s*:\s*dto\.userId/);
      expect(
        createBlock![1],
        'create 分支必须条件性写 customerId(新建 C 端会话要带)',
      ).toMatch(/dto\.customerId\s*!==\s*undefined\s*\?\s*\{\s*customerId\s*:\s*dto\.customerId/);
    });
  });
});