/**
 * @status implemented
 * @change-id cs-round-067
 * @incident-id (TBD)
 * @incident-date 2026-08-19
 * @root-cause prod session 119 截图(2026-08-19 15:55):用户在 AI 客服页面
 *   (chat.suhhai.cn/chat/119,已转人工)发消息,ERP 后台(app.suhhai.cn/tickets)
 *   "对话流"收不到实时推送,必须刷新才能看到。
 *
 *   cs-round-066 修复后仍不生效:因为 cs-round-066 的根因分析错了 — 修正日志
 *   `server.type=Namespace` 实际上是 NestJS @WebSocketServer() 注入的规范行为
 *   (并没有 bug),`.to().emit()` 在 Namespace 实例上就是正确的 broadcast 调用。
 *
 *   真正根因在 ERP frontend — socket.io-client 端:
 *     erp-admin-frontend/src/hooks/use-conversation.ts:130 调用
 *       `io(resolveWsUrl(), { auth: { sessionKey, token } })`
 *     resolveWsUrl() 返回 'wss://api.suhhai.cn' (无 /realtime 路径)。
 *     socket.io 默认连 default namespace `/`,但 backend gateway 注册在
 *     `/realtime` namespace。两个 namespace 的 room 完全隔离 — backend emit 到
 *     `session:119` room 永远到不了 default namespace 客户端。
 *
 *   对照 ai-cs-demo(能收到 — user_message 实时回灌给用户端):
 *     ai-cs-demo/src/lib/realtime-client.ts:75
 *       `socket = io(\`${url}/realtime\`, ...)` — 显式带 /realtime 路径
 *
 *   端到端验证(2026-08-19 08:06-08:07 跑 ws listener,见 §实测):
 *     - Listener #1: io('wss://api.suhhai.cn') 在 default namespace,触发
 *       POST /api/internal/cs/sessions/119/messages role=user → 201 messageId=156
 *       写入后,listener 收到 0 个 event ❌
 *     - Listener #2: io('wss://api.suhhai.cn/realtime') 在 /realtime namespace,
 *       同样 POST → 201 messageId=157,listener 立即收到 ✅ user_message event
 *       (时延 ~500ms)
 *
 *   因此修复契约:erp-frontend use-conversation.ts 的 io() URL 必须拼上 /realtime,
 *   跟 ai-cs-demo realtime-client.ts 一致。
 *
 *   Out of scope:
 *   - 反向统一两端(ai-cs-demo 显式拼 /realtime 是对的;只修 erp-frontend 跟它对齐)
 *   - 改 backend gateway namespace(契约不变,still /realtime)
 *   - 改 emit payload schema / 事件名
 *   - 改 socket.io(升级 / 换 transport)— 当前 4.8.3 够用
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

describe('cs-round-067: ERP frontend WS 客户端必须连 /realtime namespace', () => {
  describe('A. use-conversation.ts 必须拼 /realtime namespace path', () => {
    it('Then: resolveWsUrl() 的 prod 分支必须返回 wss://api.suhhai.cn/realtime(带 /realtime 路径)', () => {
      const p = resolve(ROOT, 'erp-admin-frontend/src/hooks/use-conversation.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约:prod 分支必须 return 包含 /realtime 的 URL
      // 典型正确写法:`return \`${wsProto}//api.suhhai.cn/realtime\`;`
      const prodBranch = text.match(
        /return\s+[`'"][^`'"]*\$\{wsProto\}\/\/api\.suhhai\.cn\/realtime[`'"]/,
      );
      expect(
        prodBranch?.[0] ?? '',
        'prod 分支必须返回 ${wsProto}//api.suhhai.cn/realtime(显式拼 /realtime namespace 路径),' +
          '否则 socket.io 连 default namespace / 收不到 backend emit 的 /realtime 房间事件',
      ).toBeTruthy();
    });

    it('Then: resolveWsUrl() 的 dev 分支必须返回 ws://localhost:3001/realtime(带 /realtime 路径)', () => {
      const p = resolve(ROOT, 'erp-admin-frontend/src/hooks/use-conversation.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const devBranch = text.match(
        /return\s+[`'"][^`'"]*\$\{wsProto\}\/\/\$\{hostname\}:3001\/realtime[`'"]/,
      );
      expect(
        devBranch?.[0] ?? '',
        'dev 分支必须返回 ${wsProto}//${hostname}:3001/realtime(显式拼 /realtime namespace 路径)',
      ).toBeTruthy();
    });

    it('Then: io() 调用必须直接传 resolveWsUrl()(URL 已含 /realtime,不能 path 选项覆盖)', () => {
      const p = resolve(ROOT, 'erp-admin-frontend/src/hooks/use-conversation.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 契约:io(resolveWsUrl(), { auth: ... }) — 不能 path: '/realtime' 也不能 path: '/socket.io'
      const ioCall = text.match(/io\(\s*resolveWsUrl\(\)\s*,/);
      expect(
        ioCall?.[0] ?? '',
        'io() 必须用 resolveWsUrl()(已含 /realtime namespace),不传 path 选项',
      ).toBeTruthy();

      // 反向契约:不能 path 选项
      const ioWithPath = text.match(/io\([^)]*?path\s*:/);
      expect(
        ioWithPath,
        'io() 不能传 path 选项(socket.io-client 的 path 是 socket.io engine URL 路径,跟 namespace 不同 ' +
          '— namespace 由 URL path 决定)',
      ).toBeNull();
    });
  });

  describe('B. 回归契约(ai-cs-demo 端不变)', () => {
    it('Then: ai-cs-demo realtime-client.ts 必须仍 io(\`${url}/realtime\`, ...)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/lib/realtime-client.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const ioCall = text.match(/io\(\s*[`'"]\$\{url\}\/realtime[`'"]\s*,/);
      expect(
        ioCall?.[0] ?? '',
        'ai-cs-demo 端必须仍 io(`${url}/realtime`, ...) — 这是 working side 的契约,本次不动',
      ).toBeTruthy();
    });

    it('Then: backend gateway 仍 @WebSocketGateway({ namespace: \'/realtime\' })', () => {
      const p = resolve(ROOT, 'erp-admin-backend/src/modules/ws/realtime.gateway.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'gateway 必须仍绑 /realtime namespace(契约 cs-round-067 不破坏 backend)',
      ).toMatch(/@WebSocketGateway\(\s*\{[\s\S]*?namespace\s*:\s*['"]\/realtime['"]/);
    });
  });

  describe('C. WS 客户端必须仍带 sessionKey + token(auth 契约不变)', () => {
    it('Then: io({ auth: { sessionKey, token: import.meta.env.VITE_INTERNAL_TOKEN } })', () => {
      const p = resolve(ROOT, 'erp-admin-frontend/src/hooks/use-conversation.ts');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      expect(
        text,
        'auth 契约:必须 sessionKey + token(INTERNAL_TOKEN env)',
      ).toMatch(/auth\s*:\s*\{[\s\S]*?sessionKey\s*:/);
      expect(
        text,
        'token 必须从 import.meta.env.VITE_INTERNAL_TOKEN 注入',
      ).toMatch(/token\s*:\s*import\.meta\.env\.VITE_INTERNAL_TOKEN/);
    });
  });
});
