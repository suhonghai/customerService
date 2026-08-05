/**
 * @status draft
 * @change-id cs-round-011
 * // @cross-package: backend,ai-cs
 *
 * cs-round-011:流式回复抗中断 — 用户关闭页面/断网后,后端继续生成,
 * 再次进入页面按消息状态分发(完成/生成中/异常),生成中可订阅续推。
 *
 * Why:用户截图复现 — 发了"快递一般几天能到",立刻关页面,再次进入只看到用户问题,
 *   没有任何 assistant 回复(连"正在生成"都没有)。原实现里生成任务和 SSE 连接耦合,
 *   客户端一断生成就停;且历史拉取对 status=2 但 content 为空的占位消息存在渲染盲区。
 *
 * 契约(跨包 — backend 守门 + ai-cs 前端):
 *   A. 后端生成任务必须和 SSE 连接解耦 — 客户端断开后生成继续到 status=1。
 *   B. 临时抖动(单次 AI 超时/网络闪断)后端自动重试 1-2 次,无感;持续失败标 status=4。
 *   C. 历史拉取按 status 分发:
 *      - status=1 → 直接渲染完整 content
 *      - status=2 → 渲染已有 partial content + 提示"正在生成"
 *      - status=4 → 渲染已有 partial + 提示"服务异常"+ 用户主动"重新生成"按钮
 *   D. status=2 时,前端自动建立续推连接订阅后续 chunk,append 到同一条 message 上。
 *
 * 落点(为什么放根 tests/_specs/ 而不是 backend/test/):
 *   - 跨包:backend 重试 + 占位落库 + 订阅接口 + ai-cs 前端状态分发都要改
 *   - 端到端契约,任一端不跟进都会导致"再次进入看不到答案"复现
 *   - 行为级 spec(jest e2e)在 erp-admin-backend/test/cs-round-011.e2e-spec.ts
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

describe('cs-round-011: 流式回复抗中断', () => {
  // ── 契约 A:后端生成任务与 SSE 连接解耦 ─────────────
  describe('Given: 后端 chat stream 实现', () => {
    it('Then: ai-cs-demo chat/route.ts 的 stream 处理不依赖 SSE 连接存活', () => {
      const routePath = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      expect(existsSync(routePath)).toBe(true);
      const text = readFileSync(routePath, 'utf-8');
      // 信号 1:有独立的 generation task / background continuation 概念
      // (不能只是 try/finally 包 stream,必须有「连接断了任务不取消」的明确路径)
      expect(text).toMatch(/(detached|backgroundTask|keepAliveGeneration|generationPromise)/i);
      // 信号 2:onChunk 落库是同步 await,即使 stream controller 报错也先写盘
      expect(text).toMatch(/schedulePatch|flushPatch|appendMessage|patchMessage/i);
    });

    it('Then: 后端 PATCH /api/internal/cs/sessions/:id/messages/:msgId 接受 status=2 的 partial 内容', () => {
      const ctrlPath = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.controller.ts',
      );
      expect(existsSync(ctrlPath)).toBe(true);
      const text = readFileSync(ctrlPath, 'utf-8');
      expect(text).toMatch(/messages.*msgId|messages\/:msgId/);
      // update-message DTO 允许 partial content 写入(不要求非空)
      const dtoPath = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/dto/update-message.dto.ts',
      );
      if (existsSync(dtoPath)) {
        const dtoText = readFileSync(dtoPath, 'utf-8');
        expect(dtoText).toMatch(/content/i);
      }
    });
  });

  // ── 契约 B:临时抖动后端自动重试 ─────────────────
  describe('Given: 后端 AI 调用出错(网络闪断 / 模型超时)', () => {
    it('Then: ai-cs-demo chat/route.ts 含自动重试 1-2 次的逻辑', () => {
      const routePath = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const text = readFileSync(routePath, 'utf-8');
      // retry / withRetry / exponential backoff 任一关键字
      expect(text).toMatch(/(retry|withRetry|backoff)/i);
    });
  });

  // ── 契约 C:前端状态分发渲染 ───────────────────────
  describe('Given: 前端历史拉取 + 状态机', () => {
    it('Then: refetch-history.ts 按 status 分发(status=1/2/4 三态都覆盖)', () => {
      const path = resolve(ROOT, 'ai-cs-demo/src/lib/refetch-history.ts');
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf-8');
      // status 2 = streaming 提示正在生成
      expect(text).toMatch(/status\s*===?\s*2|isStreaming/i);
      // status 4 = error 提示服务异常 + 重新生成入口
      expect(text).toMatch(/status\s*===?\s*4|isError|retry/i);
    });

    it('Then: use-chat-state.ts 把 streaming 消息标 isInterrupted 而不是过滤掉', () => {
      const path = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
      expect(existsSync(path)).toBe(true);
      const text = readFileSync(path, 'utf-8');
      // status=2 必须标 isInterrupted(已有),且 content 为空也保留
      expect(text).toMatch(/isInterrupted/i);
      expect(text).toMatch(/status\s*===?\s*2/i);
    });
  });

  // ── 契约 D:状态=2 自动订阅续推 ─────────────────────
  describe('Given: status=2 的消息再次进入页面', () => {
    it('Then: 前端有「订阅续推」接口(transport 复用 POST /api/chat 或新订阅端点)', () => {
      // 两种实现路径都接受:复用 chat 流 + fromMessageId 参数,或新订阅接口
      const chatPath = resolve(ROOT, 'ai-cs-demo/src/app/api/chat/route.ts');
      const sessionsDir = resolve(ROOT, 'ai-cs-demo/src/app/api/sessions');
      const chatText = readFileSync(chatPath, 'utf-8');
      const hasFromMessageId = /fromMessageId|continueFromMessageId|resumeFromMessageId/i.test(
        chatText,
      );
      // 至少有一种订阅机制(transport resume 或新路由)
      expect(hasFromMessageId || existsSync(sessionsDir)).toBe(true);
    });

    it('Then: 前端 transport 在 reload 检测到 status=2 时自动触发续推', () => {
      const candidates = [
        'ai-cs-demo/src/hooks/use-chat-with-errors.ts',
        'ai-cs-demo/src/hooks/use-chat.ts',
        'ai-cs-demo/src/lib/refetch-history.ts',
      ];
      let found = false;
      for (const c of candidates) {
        const p = resolve(ROOT, c);
        if (!existsSync(p)) continue;
        const t = readFileSync(p, 'utf-8');
        if (/fromMessageId|continueFromMessageId|resumeStream|resumeFromMessageId/i.test(t)) {
          found = true;
          break;
        }
      }
      expect(found, 'no auto-resume trigger found').toBe(true);
    });
  });

  // ── 后端 e2e spec 必须存在 ─────────────────────────
  describe('Given: 后端 jest e2e spec', () => {
    it('Then: erp-admin-backend/test/cs-round-011.e2e-spec.ts 存在且至少 3 个 scenario', () => {
      const specPath = resolve(
        ROOT,
        'erp-admin-backend/test/cs-round-011.e2e-spec.ts',
      );
      expect(existsSync(specPath)).toBe(true);
      const text = readFileSync(specPath, 'utf-8');
      const scenarios = text.match(/describe\(/g) ?? [];
      expect(scenarios.length).toBeGreaterThanOrEqual(3);
    });
  });
});