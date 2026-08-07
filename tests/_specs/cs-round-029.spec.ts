/**
 * @status draft
 * @change-id cs-round-029
 * // @cross-package: frontend, backend, ai-cs
 *
 * cs-round-029:WS 实时推送 + 客服消息乐观插入双修
 *
 * Why:
 *   T-20260807002 工单场景下,ERP /tickets 详情页运营回复客户:
 *     - 当前 ERP 页**不实时显示自己刚发的消息**(刷新后才有 → 只能靠 REST history)
 *     - AI 客服前端也**收不到**这条客服回复
 *     - 状态栏 "实时未连接(降级 REST)" — WS 握手失败
 *
 *   双根因:
 *     1) **WS 鉴权缺失**:`erp-admin-frontend/src/hooks/use-conversation.ts:115`
 *        handshake.auth 只传 `sessionKey`,server `realtime.gateway.ts:58-67`
 *        严格先校验 `token === INTERNAL_TOKEN`,缺即 `socket.disconnect(true)`。
 *        ai-cs 端 `realtime-client.ts:55` 已有 token(`cs-round-007` 修过),只剩 ERP 这边。
 *
 *     2) **乐观插入静默失效**:`ticket.service.reply()` 返回 `{ticketId, logId, createdAt}`
 *        没有 `messageId`,前端 `send()` 本地 upsert 永远拿不到 id,WS push 到达前的
 *        几毫秒窗口期消息不显示;且 `created.id` 缺失导致去重键失效,WS push 来了
 *        又会重复插入。
 *
 * Spec 契约(根 spec 走代码契约 grep + 文件读取,无需 MySQL 容器):
 *
 *   A. ERP `use-conversation.ts` WS handshake.auth 必须含 `token` 字段(值 = VITE_INTERNAL_TOKEN)
 *   B. ai-cs `realtime-client.ts` WS handshake.auth 必须含 `token` 字段(已有,守住不破坏)
 *   C. 后端 `ticket.service.ts` reply() 返回值类型必须含 `messageId` 字段
 *   D. ERP `use-conversation.ts` send() 拿到响应后必须本地 upsert 消息(走 created.id)
 *   E. 三个 env 文件(根 / erp-admin-backend / ai-cs-demo)必须含 INTERNAL_TOKEN / VITE_INTERNAL_TOKEN / NEXT_PUBLIC_INTERNAL_TOKEN,且值长度 > 0
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行(同 cs-round-014 / 026 / 028)
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

/** 抠出 `sock = io(...)` 整个调用块,直到匹配的 `});` 结束 */
function extractIoBlock(text: string, afterMarker: string): string {
  const idx = text.indexOf(afterMarker);
  if (idx < 0) return '';
  // 找 `io(` 起点
  const ioIdx = text.indexOf('io(', idx);
  if (ioIdx < 0) return '';
  // 找匹配的 `)`
  let depth = 0;
  let i = ioIdx + 2;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) {
        // closing of io( — but io(...) is a function call, so this is the first `(` close
      }
      depth--;
      if (depth < 0) break;
    }
    i++;
  }
  // 现在 i 在 io(...) 的 `)` 后;再 scan 到 `);` 或 `}\n);`
  let j = i;
  while (j < text.length) {
    if (text[j] === ';' || text[j] === ',') break;
    j++;
  }
  return text.slice(ioIdx, j + 1);
}

describe('cs-round-029: WS auth token + reply messageId 契约', () => {
  // ── 契约 A:ERP use-conversation.ts WS handshake.auth 必须含 token ──
  describe('Given: erp-admin-frontend use-conversation.ts WS 握手', () => {
    it('Then: io(...) 调用块内 handshake.auth 必须含 token 字段', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-conversation.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 sock = io(...) 块 — 寻找 `sock = io(` 或 `sock = io<...>(` 起点
      const sockIoMatch = text.match(/sock\s*=\s*io\s*\(/);
      expect(sockIoMatch?.[0] ?? '', 'sock = io(...) 必须存在').toBeTruthy();
      const startIdx = sockIoMatch!.index!;
      // 抠到匹配的 `);`
      let depth = 0;
      let i = startIdx + 'sock = io('.length;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
          if (depth === 0) {
            // closing of io()
            break;
          }
          depth--;
        }
        i++;
      }
      // i 现在是 io() 的 `)`;scan 到 `);`
      let j = i;
      while (j < text.length && text[j] !== ';') j++;
      const ioBlock = text.slice(startIdx, j + 1);

      // 反例:auth 不能只有 sessionKey,必须有 token
      const authObj = ioBlock.match(/auth\s*:\s*\{([^}]+)\}/);
      expect(
        authObj?.[1] ?? '',
        'io(...) 内必须有 auth: { ... } 对象',
      ).toBeTruthy();
      const authBody = authObj![1];

      expect(
        authBody,
        'auth 对象必须含 `token:` 字段(否则 realtime.gateway.ts:58-67 立即 disconnect)',
      ).toMatch(/\btoken\s*:/);

      // token 值应取自 VITE_INTERNAL_TOKEN env(避免硬编码 / 漏 env)
      const tokenValue = authBody.match(/token\s*:\s*([^,}\s]+(?:\s*\?\?\s*['"][^'"]*['"])?)/);
      expect(
        tokenValue?.[1] ?? '',
        'token 值应取自 import.meta.env.VITE_INTERNAL_TOKEN(或带空串 fallback)',
      ).toBeTruthy();
      expect(
        tokenValue?.[1] ?? '',
        'token 值应包含 VITE_INTERNAL_TOKEN env 引用',
      ).toContain('VITE_INTERNAL_TOKEN');
    });
  });

  // ── 契约 B:ai-cs realtime-client.ts WS handshake.auth 必须含 token(守住不破坏) ──
  describe('Given: ai-cs-demo realtime-client.ts WS 握手', () => {
    it('Then: socket = io(...) 内 handshake.auth 必须含 token 字段', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/lib/realtime-client.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // ai-cs realtime-client 是模块级单例 socket = io(...)
      const ioMatch = text.match(/socket\s*=\s*io\s*\(/);
      expect(ioMatch?.[0] ?? '', 'socket = io(...) 必须存在').toBeTruthy();
      const startIdx = ioMatch!.index!;
      let depth = 0;
      let i = startIdx + 'socket = io('.length;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') {
          if (depth === 0) break;
          depth--;
        }
        i++;
      }
      let j = i;
      while (j < text.length && text[j] !== ';') j++;
      const ioBlock = text.slice(startIdx, j + 1);

      const authObj = ioBlock.match(/auth\s*:\s*\{([^}]+)\}/);
      expect(
        authObj?.[1] ?? '',
        'io(...) 内必须有 auth: { ... } 对象',
      ).toBeTruthy();
      expect(
        authObj![1],
        'auth 对象必须含 `token:` 字段(cs-round-007 已加,守住不破)',
      ).toMatch(/\btoken\s*:/);
      expect(
        authObj![1],
        'token 值应取自 NEXT_PUBLIC_INTERNAL_TOKEN env',
      ).toContain('NEXT_PUBLIC_INTERNAL_TOKEN');
    });
  });

  // ── 契约 C:后端 ticket.service reply() 返回值类型必须含 messageId ──
  describe('Given: erp-admin-backend ticket.service.ts reply() 方法', () => {
    it('Then: reply() 函数体内必须 return 含 messageId 字段的对象', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/ticket/ticket.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 reply() 方法体
      const m = text.match(/async\s+reply\s*\(/);
      expect(m?.[0] ?? '', 'reply() 方法必须存在').toBeTruthy();
      const startIdx = m!.index!;
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
          if (started && depth === 0) break;
        }
        i++;
      }
      const methodBody = text.slice(startIdx, i + 1);

      // 找到方法内最后一个 `return { ... }` — reply() 末尾的 return
      const returnMatches = [...methodBody.matchAll(/\breturn\s*\{([\s\S]*?)\}\s*;/g)];
      expect(
        returnMatches.length,
        'reply() 必须至少有一个 return {...}',
      ).toBeGreaterThanOrEqual(1);
      const lastReturn = returnMatches[returnMatches.length - 1];
      const returnBody = lastReturn![1];

      expect(
        returnBody,
        'reply() 返回值必须含 `messageId` 字段(供前端 send() 拿 id 做乐观插入)',
      ).toMatch(/\bmessageId\s*:/);

      // messageId 应该引用某个已创建的 message(避免 undefined / 0)
      // 宽松匹配:messageId: created.id / messageId: created?.id / messageId: msg.id 之类
      const messageIdValue = returnBody.match(/messageId\s*:\s*([^,}\n]+)/);
      expect(
        messageIdValue?.[1] ?? '',
        'messageId 值应引用一个已创建的 message id(如 created.id / created?.id)',
      ).toBeTruthy();
      expect(
        messageIdValue?.[1] ?? '',
        'messageId 值不应是字面量 undefined / null',
      ).not.toMatch(/^\s*(undefined|null)\s*$/);
    });
  });

  // ── 契约 D:ERP use-conversation.ts send() 必须本地 upsert 消息(走 created.id) ──
  describe('Given: erp-admin-frontend use-conversation.ts send() 乐观插入', () => {
    it('Then: send() 拿到 created messageId 后必须本地 setMessages 插入', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-conversation.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 send 函数体
      const sendMatch = text.match(/const\s+send\s*=\s*useCallback\s*\(/);
      expect(sendMatch?.[0] ?? '', 'send = useCallback 必须存在').toBeTruthy();
      const startIdx = sendMatch!.index!;
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
          if (started && depth === 0) break;
        }
        i++;
      }
      const sendBody = text.slice(startIdx, i + 1);

      // send 必须有 setMessages(prev => [...prev, created]) 或类似乐观插入
      // 严格:有 setMessages 引用,且 setMessages 之前的变量含 created
      const optimisticInsert = sendBody.match(
        /setMessages\s*\(\s*\(?\s*prev\s*\)?\s*=>/,
      );
      expect(
        optimisticInsert?.[0] ?? '',
        'send() 必须 setMessages(prev => ...) 插入新消息(乐观 UI)',
      ).toBeTruthy();

      // created 变量应在 setMessages 之前已从 response 解析出来
      // 简化:必须有 `created` 变量名出现,且 setMessages 内引用 created
      expect(
        sendBody,
        'send() 必须使用 `created` 变量作为新消息来源',
      ).toMatch(/\bcreated\b/);

      // setMessages 内必须引用 created(不只 created.id)
      const setMessagesBlock = sendBody.match(
        /setMessages\s*\(\s*\(?\s*prev\s*\)?\s*=>\s*\[[^\]]*\]/,
      );
      expect(setMessagesBlock?.[0] ?? '', 'setMessages([...]) 块必须存在').toBeTruthy();
      expect(
        setMessagesBlock?.[0] ?? '',
        'setMessages 内必须引用 created 变量(乐观插入本体)',
      ).toMatch(/\bcreated\b/);

      // 必须有 knownIds.current.add(created.id) 之类的去重(防止 WS push 重复)
      const dedupAdd = sendBody.match(
        /knownIds\.current\.add\s*\(\s*created\.id\s*\)/,
      );
      expect(
        dedupAdd?.[0] ?? '',
        'send() 必须在插入前 knownIds.current.add(created.id),防 WS push 重复',
      ).toBeTruthy();
    });
  });

  // ── 契约 E:三处 env 文件必须含 token 配置且非空(只查入仓的 .env.example 系列) ──
  describe('Given: env 配置隔离(工程约束 #2 INTERNAL_TOKEN 三处须一致)', () => {
    it('Then: 入仓的 .env.example 系列必须含对应 token 配置项(env-based check,放过具体值)', () => {
      // 注:.env.development / .env.production / .env.test 不入仓(工程约束 #2),
      // 只查 .env.example + .env.test.example 这两类模板,保证 onboarding 能拿到 token 配置骨架。
      const envFiles = [
        { path: '.env.example', key: 'INTERNAL_TOKEN' },
        { path: 'erp-admin-backend/.env.example', key: 'INTERNAL_TOKEN' },
        { path: 'erp-admin-backend/.env.test.example', key: 'INTERNAL_TOKEN' },
        { path: 'ai-cs-demo/.env.example', key: 'INTERNAL_TOKEN' },
        { path: 'ai-cs-demo/.env.example', key: 'NEXT_PUBLIC_INTERNAL_TOKEN' },
        { path: 'ai-cs-demo/.env.test.example', key: 'NEXT_PUBLIC_INTERNAL_TOKEN' },
        { path: 'erp-admin-frontend/.env.example', key: 'VITE_INTERNAL_TOKEN' },
        { path: 'erp-admin-frontend/.env.test.example', key: 'VITE_INTERNAL_TOKEN' },
      ];

      const missing: string[] = [];
      const empty: string[] = [];
      for (const f of envFiles) {
        const p = resolve(ROOT, f.path);
        if (!existsSync(p)) {
          missing.push(`${f.path}(文件不存在)`);
          continue;
        }
        const text = readFileSync(p, 'utf-8');
        // 找 `KEY=value` 或 `KEY="value"` 行(允许多行注释分隔)
        const lineMatch = text.match(
          new RegExp(`^\\s*${f.key}\\s*=\\s*"?([^"\\n]+)"?\\s*$`, 'm'),
        );
        if (!lineMatch) {
          missing.push(`${f.path}(缺 ${f.key}= 行)`);
          continue;
        }
        const value = (lineMatch[1] ?? '').trim();
        if (value.length === 0) {
          empty.push(`${f.path}(${f.key}= 为空)`);
        }
      }

      expect(
        missing,
        '入仓的 .env.example 系列必须含对应 token 配置项:\n' + missing.join('\n'),
      ).toEqual([]);
      expect(
        empty,
        'env 文件 token 配置项值不可为空:\n' + empty.join('\n'),
      ).toEqual([]);
    });
  });
});