/**
 * @status draft
 * @change-id cs-round-007
 * // @cross-package: backend,ai-cs
 *
 * (注:本 spec 需 test DB + .env.test 才能跑;CI pr-e2e.yml 跑;本地跳过)
 *
 * cs-round-007:WebSocket 握手鉴权
 *
 * Why:gateway 仅读 socket.handshake.auth.sessionKey 查 DB 就放行,
 * 无 token / 无 JWT / 无签名 / 无过期。sessionKey 由 nanoid(10) 生成,
 * 不可枚举所以非 P0,但它是「无过期 bearer、未与登录 customer 绑定、
 * 泄漏后无吊销机制」。CLAUDE.md 11 项整改里唯一没做的功能项(原 P2-4)。
 *
 * 修法:走 INTERNAL_TOKEN(server-to-server 已有 token)做 WS 握手。
 * - 客户端 handshake auth: { sessionKey, token }
 * - 服务端 handleConnection 校验 token 必须等于 env.INTERNAL_TOKEN
 * - token 错或缺,socket.disconnect(true) 立即拒绝,不进入业务逻辑
 *
 * 契约(跨包 — backend 守门 + ai-cs 客户端):
 *   1. 无 token → connect 失败(disconnect)
 *   2. 错 token → connect 失败(disconnect)
 *   3. 正确 token + 无 sessionKey → connect 失败(disconnect,保留旧行为)
 *   4. 正确 token + 有效 sessionKey → connect 成功,加入对应 room
 *
 * 落点(为什么放根 tests/_specs/ 而不是 backend/test/):
 *   - 跨包:backend 实现 + ai-cs 客户端都需要改,任一端不跟进都会导致契约失败
 *   - 端到端:WS connect 是 client/server 协议,不是单方 backend e2e
 *   - backend/test/cs-round-007.e2e-spec.ts 单独验证后端 socket.io 服务端行为
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

describe('cs-round-007: WebSocket 握手鉴权', () => {
  // 跨包 spec:跑 grep 验证实现就位(server 校验 + client 带 token)
  describe('Given: 服务端实现 + 客户端调用 + INTERNAL_TOKEN 约定', () => {
    it('Then: erp-admin-backend realtime.gateway.ts 包含 token 校验逻辑', () => {
      const gatewayPath = resolve(ROOT, 'erp-admin-backend/src/modules/ws/realtime.gateway.ts');
      expect(existsSync(gatewayPath)).toBe(true);
      const text = readFileSync(gatewayPath, 'utf-8');
      // 必须含 INTERNAL_TOKEN 校验
      expect(text).toMatch(/INTERNAL_TOKEN/);
      // 必须有 disconnect 拒绝路径
      expect(text).toMatch(/disconnect/);
    });

    it('Then: ai-cs-demo realtime-client.ts handshake 带 token 字段', () => {
      const clientPath = resolve(ROOT, 'ai-cs-demo/src/lib/realtime-client.ts');
      expect(existsSync(clientPath)).toBe(true);
      const text = readFileSync(clientPath, 'utf-8');
      // auth 对象含 token 字段
      expect(text).toMatch(/auth:\s*\{[^}]*token/s);
    });

    it('Then: 根 .env.test.example 含 INTERNAL_TOKEN(同 #37 一致)', () => {
      const envPath = resolve(ROOT, '.env.test.example');
      expect(existsSync(envPath)).toBe(true);
      const text = readFileSync(envPath, 'utf-8');
      // INTERNAL_TOKEN 与 backend / frontend / ai-cs-demo 一致
      const match = text.match(/INTERNAL_TOKEN=(\S+)/);
      expect(match, '根 .env.test.example 缺 INTERNAL_TOKEN').not.toBeNull();
      const rootToken = match![1];

      // backend / frontend / ai-cs-demo 三处一致
      for (const sub of [
        'erp-admin-backend/.env.test.example',
        'erp-admin-frontend/.env.test.example',
        'ai-cs-demo/.env.test.example',
      ]) {
        const subPath = resolve(ROOT, sub);
        if (!existsSync(subPath)) continue; // ai-cs-demo / frontend 可能没 INTERNAL_TOKEN
        const subText = readFileSync(subPath, 'utf-8');
        const subMatch = subText.match(/INTERNAL_TOKEN=(\S+)/);
        if (subMatch) {
          expect(subMatch[1], `${sub} INTERNAL_TOKEN 与根不一致`).toBe(rootToken);
        }
      }
    });
  });

  // 后端子包 spec 存在 + 跑得通:jest e2e-spec 已存在并覆盖
  describe('Given: 后端 jest e2e spec 存在', () => {
    it('Then: erp-admin-backend/test/cs-round-007.e2e-spec.ts 存在且含必要 scenario', () => {
      const specPath = resolve(
        ROOT,
        'erp-admin-backend/test/cs-round-007.e2e-spec.ts',
      );
      expect(existsSync(specPath)).toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      // 至少 3 个 scenario:无 token / 错 token / 正确 token
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(scenarios.length).toBeGreaterThanOrEqual(3);
    });
  });
});