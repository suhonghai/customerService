/**
 * @status implemented
 * @change-id cs-round-036
 * // @cross-package: backend, ai-cs, frontend
 *
 * cs-round-036:工单可双向关闭 — 用户在 ai-cs 前端主动"结束对话"关单
 *              + 后台 ERP 实时收到 ticket_closed 事件
 *
 * Why:
 *   现状:工单关闭只能 erp-admin 后台客服手动 `改状态 → 4`,用户无主动权。
 *   行业做法(Zendesk Solve / Intercom Close / 飞书客服 / 腾讯企点):
 *     "客服已解决"按钮 + 用户"结束对话"按钮 + SLA 超时自动 close。
 *   本任务做前两条的"用户主动关闭"那一条(SLA 自动 close 留 follow-up)。
 *
 *   关键设计决策:
 *   - 用户主动关闭必须**旁路** `STATE_TRANSITIONS`(用户场景大概率 status=1 待领取
 *     / 2 处理中,按硬约束 1→4 / 2→4 都是 STATE_NOT_ALLOW);
 *     走独立 service 方法 `closeTicketBySession(sessionKey, reason)` 显式写
 *     `status=4 + closedAt=now + closedBy='user'`,绕过 updateStatus 状态机校验。
 *   - 必须做 **sessionKey 归属校验**(internal.service 内 `findUnique csSession
 *     where sessionKey` → 确认 ticket.sessionId 属于该 session),防止持有
 *     INTERNAL_TOKEN 的任意服务关别人工单。
 *   - WS emit `ticket_closed` 事件(ai-cs 端切终止 UI + erp 后台 ConversationPanel
 *     输入框 disable),让两边都实时感知关闭。
 *
 * Spec 契约(代码契约 grep,跨包 7 文件):
 *
 *   A. internal.controller.ts 新增 `POST /api/internal/cs/sessions/:sessionKey/close-ticket`
 *      endpoint,带 @UseGuards(InternalGuard) + DTO 含 reason 可选
 *   B. internal.service.ts 新增 `closeTicketBySession(sessionKey, reason?)` 方法,
 *      必须先按 sessionKey 查到 csSession → 找到 open ticket → 改 status=4 +
 *      closedAt=now + 写 audit log;不允许跳过 sessionKey 归属校验直接操作任意 ticketId
 *   C. ticket.service.ts 在 updateStatus 收尾(close 路径 status=4)emit WS
 *      'ticket_closed' 到 room `session:${sessionId}`,payload 含
 *      {ticketId, ticketNo, status:4, closedAt, closedBy}
 *   D. ai-cs erp-admin-client.ts 新增 `closeTicketBySession(sessionKey, reason?)`
 *      方法,内部 POST 到上面 internal endpoint
 *   E. ai-cs ChatView.tsx(或同级组件)在 MessageInput 旁新增"结束对话"按钮,
 *      仅当工单 OPEN 状态显示,确认弹窗防误触,成功后切终止 UI(输入框 disable
 *      + 显示"对话已结束"banner)
 *   F. ai-cs 端 useRealtime 订阅 `ticket_closed` 事件,触发 UI 切到终止态
 *   G. erp-admin use-conversation.ts 订阅 `ticket_closed` 事件,触发
 *      ConversationPanel 输入框 disable
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// 过滤单行 // 注释和块注释行,避免 spec 假阳/假阴
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

describe('cs-round-036: 工单可双向关闭 (用户主动关单)', () => {
  // ── 契约 A:internal.controller.ts 新 endpoint ──
  describe('A. Given: erp-admin-backend internal.controller.ts', () => {
    it('Then: 必须新增 POST close-ticket endpoint 走 InternalGuard', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.controller.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 close-ticket 路由(POST 含 sessionKey 参数)
      expect(
        text,
        '必须新增 close-ticket endpoint(POST 路径含 sessionKey/close-ticket)',
      ).toMatch(/@Post\s*\(\s*['"`]sessions\/:sessionKey\/close-ticket['"`]\s*\)/);

      // 必须接 InternalGuard(controller-level 已有,新方法自动继承)
      expect(
        text,
        'internal.controller.ts 顶部 @UseGuards(InternalGuard) 仍存在',
      ).toMatch(/@UseGuards\s*\(\s*InternalGuard\s*\)/);

      // controller 必须调 internalService.closeTicketBySession 并传 reason
      expect(
        text,
        'controller 必须调 internalService.closeTicketBySession',
      ).toMatch(/this\.internalService\.closeTicketBySession\s*\(/);
      expect(
        text,
        'controller 必须把 reason 透传到 service',
      ).toMatch(/body\.reason|reason/);
    });
  });

  // ── 契约 B:internal.service.ts closeTicketBySession + 归属校验 ──
  describe('B. Given: erp-admin-backend internal.service.ts', () => {
    it('Then: 必须新增 closeTicketBySession,先查 sessionKey 再操作 ticket', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 closeTicketBySession 方法定义
      expect(
        text,
        'internal.service.ts 必须新增 async closeTicketBySession(sessionKey, reason?) 方法',
      ).toMatch(/async\s+closeTicketBySession\s*\(\s*sessionKey/);

      // 必须按 sessionKey 查 csSession(归属校验的关键,不允许接受 ticketId 直接参数)
      expect(
        text,
        'closeTicketBySession 必须按 sessionKey 查 csSession(防任意关别人工单)',
      ).toMatch(/csSession\.findUnique\s*\(\s*\{[^}]*where\s*:\s*\{[^}]*sessionKey/);

      // 必须 update ticket status=4 + closedAt(出现在 closeTicketBySession 方法体内 — 弱匹配)
      expect(
        text,
        'closeTicketBySession 必须显式写 status=4 + closedAt=now',
      ).toMatch(/csTicket\.update[\s\S]{0,200}status\s*:\s*4[\s\S]{0,200}closedAt\s*:/);

      // 必须有 audit log 写入
      expect(
        text,
        'closeTicketBySession 必须写 csTicketLog audit log',
      ).toMatch(/csTicketLog\.create/);
    });
  });

  // ── 契约 C:ticket.service.ts emit ticket_closed ──
  describe('C. Given: erp-admin-backend ticket.service.ts updateStatus() close 分支', () => {
    it('Then: status=4 写入后必须 emit ticket_closed WS 事件', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/ticket/ticket.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 realtime.server emit 'ticket_closed'
      const emitCall = text.match(
        /this\.realtime\.server[\s\S]{0,200}\.emit\s*\(\s*['"`]ticket_closed['"`]\s*,\s*\{([\s\S]*?)\}\s*\)/,
      );
      expect(
        emitCall?.[0] ?? '',
        'ticket.service.ts 必须 emit "ticket_closed" WS 事件',
      ).toBeTruthy();

      // emit 必须发到 room `session:${...}`
      expect(
        emitCall![0],
        'emit 必须发到 room `session:${sessionId}`',
      ).toMatch(/\.to\s*\(\s*[`'"]session:\$\{/);

      // payload 必须含 ticketId + status + closedAt + closedBy
      const payload = emitCall![1];
      expect(payload, 'payload 必须含 ticketId').toMatch(/ticketId/);
      expect(payload, 'payload 必须含 status').toMatch(/status/);
      expect(payload, 'payload 必须含 closedAt').toMatch(/closedAt/);
      expect(payload, 'payload 必须含 closedBy 区分 user/operator').toMatch(/closedBy/);
    });
  });

  // ── 契约 D:ai-cs erp-admin-client.ts 新方法 ──
  describe('D. Given: ai-cs-demo erp-admin-client.ts', () => {
    it('Then: 必须新增 closeTicketBySession 方法', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/lib/erp-admin-client.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 closeTicketBySession 方法定义
      expect(
        text,
        'erp-admin-client.ts 必须新增 async closeTicketBySession(sessionKey, reason?)',
      ).toMatch(/async\s+closeTicketBySession\s*\(\s*sessionKey\s*:\s*string/);

      // 内部必须 POST 到 close-ticket endpoint(检查整个文件即可)
      expect(
        text,
        'closeTicketBySession 内部必须 POST 到 close-ticket endpoint',
      ).toMatch(/\/close-ticket/);
    });
  });

  // ── 契约 E:ai-cs ChatView / MessageInput 旁新增按钮 ──
  describe('E. Given: ai-cs-demo ChatView.tsx / MessageInput / 新组件', () => {
    it('Then: 必须有"结束对话"按钮,带确认弹窗,只在 open 工单显示', () => {
      // 简化:确认有触发 closeTicketBySession 的按钮 + 确认弹窗
      // 检查所有可能的文件
      const candidates = [
        'ai-cs-demo/src/components/chat/ChatView.tsx',
        'ai-cs-demo/src/components/chat/MessageInput.tsx',
        'ai-cs-demo/src/components/EndConversationButton.tsx',
        'ai-cs-demo/src/components/chat/EndConversationButton.tsx',
      ];
      let foundButton = false;
      let foundConfirm = false;
      let foundCloseCall = false;
      for (const f of candidates) {
        const p = resolve(ROOT, f);
        if (!existsSync(p)) continue;
        const text = stripComments(readFileSync(p, 'utf-8'));

        if (
          /结束对话|EndConversation|closeTicketBySession|结束本次咨询|关闭工单|关闭对话/.test(
            text,
          )
        ) {
          foundButton = true;
        }
        if (/确认|confirm|Modal\.confirm|弹窗|Popconfirm/.test(text)) {
          foundConfirm = true;
        }
        if (/closeTicketBySession\s*\(/.test(text)) {
          foundCloseCall = true;
        }
      }

      expect(foundButton, '必须新增"结束对话"按钮(文本或组件名)').toBe(true);
      expect(
        foundConfirm,
        '结束对话必须有确认弹窗(防误触)',
      ).toBe(true);
      expect(
        foundCloseCall,
        '按钮点击必须调 closeTicketBySession',
      ).toBe(true);
    });
  });

  // ── 契约 E2:banner 顺序 — EndConversationButton 必须在 MessageInput 之上 ──
  describe('E2. Given: ai-cs-demo ChatView.tsx 集成', () => {
    it('Then: EndConversationButton 必须出现在 MessageInput 之前(顶部 banner 区域,非输入区下方)', () => {
      const p = resolve(
        ROOT,
        'ai-cs-demo/src/components/chat/ChatView.tsx',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      const idxEnd = text.indexOf('<EndConversationButton');
      const idxInput = text.indexOf('<MessageInput');
      expect(idxEnd, 'ChatView 必须引用 <EndConversationButton>').toBeGreaterThan(0);
      expect(idxInput, 'ChatView 必须引用 <MessageInput>').toBeGreaterThan(0);
      expect(
        idxEnd < idxInput,
        'cs-round-036 UX 修正:EndConversationButton 必须在 MessageInput 之前(顶部 banner 区域),'
          + '不能再放输入框下方(几乎隐身)',
      ).toBe(true);

      // 还必须有"工单已转人工"文案(状态提示),不只是一个孤立按钮
      expect(
        text,
        'ChatView 必须在 banner 渲染"工单已转人工"状态文案(行业标准)',
      ).toMatch(/工单已转人工/);
    });
  });

  // ── 契约 F:ai-cs 端 useRealtime 订阅 ticket_closed ──
  describe('F. Given: ai-cs-demo useRealtime / useAutoResumeStreaming 等', () => {
    it('Then: WS onMessage 必须处理 ticket_closed 事件', () => {
      const candidates = [
        'ai-cs-demo/src/lib/realtime-client.ts',
        'ai-cs-demo/src/lib/components/RAGChat.tsx',
        'ai-cs-demo/src/hooks/use-auto-resume-streaming.ts',
      ];
      let found = false;
      for (const f of candidates) {
        const p = resolve(ROOT, f);
        if (!existsSync(p)) continue;
        const text = stripComments(readFileSync(p, 'utf-8'));
        // ticket_closed 事件订阅
        if (
          /ticket_closed|onTicketClosed|setTicketClosed|closedBy/.test(text)
        ) {
          found = true;
          break;
        }
      }
      expect(
        found,
        'ai-cs 端必须订阅 ticket_closed WS 事件(收后切终止 UI)',
      ).toBe(true);
    });
  });

  // ── 契约 H:cs-round-036 UX 修正2 — ticket 状态判断替代 messages.operator 推断 ──
  describe('H. Given: ai-cs-demo RAGChat.tsx + ChatView.tsx', () => {
    it('Then: 必须基于 ticket 状态判断"工单 OPEN",不再用 messages.operator 推断', () => {
      const ragchat = resolve(
        ROOT,
        'ai-cs-demo/src/lib/components/RAGChat.tsx',
      );
      const chatView = resolve(
        ROOT,
        'ai-cs-demo/src/components/chat/ChatView.tsx',
      );
      expect(existsSync(ragchat)).toBe(true);
      expect(existsSync(chatView)).toBe(true);
      const ragText = stripComments(readFileSync(ragchat, 'utf-8'));
      const viewText = stripComments(readFileSync(chatView, 'utf-8'));

      // RAGChat 必须有 sessionHasOpenTicket state(替代旧的 sessionHasOperator)
      expect(
        ragText,
        'RAGChat 必须有 sessionHasOpenTicket state(基于 ticket 状态,不再基于 messages.operator 推断)',
      ).toMatch(/sessionHasOpenTicket/);

      // RAGChat 必须调 getSessionOpenTicket 拉真实状态
      expect(
        ragText,
        'RAGChat 必须调 getSessionOpenTicket(backendSessionId) 拉 ticket 真实状态',
      ).toMatch(/getSessionOpenTicket\s*\(/);

      // onTicketClosed handler 必须 setSessionHasOpenTicket(false)— 关单后立即同步
      expect(
        ragText,
        'onTicketClosed handler 必须 setSessionHasOpenTicket(false)(关单后立即隐藏 banner/按钮)',
      ).toMatch(/onTicketClosed[\s\S]*?setSessionHasOpenTicket\s*\(\s*false/);

      // ChatView 必须用 sessionHasOpenTicket 控制 banner/按钮可见性
      expect(
        viewText,
        'ChatView 必须用 sessionHasOpenTicket 控制 banner + 结束按钮(不再用 sessionHasOperator)',
      ).toMatch(/sessionHasOpenTicket/);

      // banner 块必须以 sessionHasOpenTicket 作为渲染条件(关单后立即隐藏)
      expect(
        viewText,
        'ChatView banner 必须用 sessionHasOpenTicket 作为渲染条件(关单后 false)',
      ).toMatch(/\{sessionHasOpenTicket\s*&&\s*\(/);

      // EndConversationButton visible 必须传 sessionHasOpenTicket
      expect(
        viewText,
        'EndConversationButton visible 必须传 sessionHasOpenTicket(关单后 false)',
      ).toMatch(/visible=\{sessionHasOpenTicket\}/);
    });
  });

  // ── 契约 G:erp-admin ConversationPanel / use-conversation 订阅 + disable ──
  describe('G. Given: erp-admin-frontend use-conversation.ts + ConversationPanel.tsx', () => {
    it('Then: use-conversation 必须订阅 ticket_closed;ConversationPanel 输入框条件 disable', () => {
      const useConv = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-conversation.ts',
      );
      const panel = resolve(
        ROOT,
        'erp-admin-frontend/src/components/ConversationPanel.tsx',
      );
      expect(existsSync(useConv)).toBe(true);
      expect(existsSync(panel)).toBe(true);
      const useConvText = stripComments(readFileSync(useConv, 'utf-8'));
      const panelText = stripComments(readFileSync(panel, 'utf-8'));

      // use-conversation 必须订阅 ticket_closed
      expect(
        useConvText,
        'use-conversation.ts 必须订阅 ticket_closed 事件',
      ).toMatch(/ticket_closed|onTicketClosed|ticketClosed/);

      // ConversationPanel 必须有 ticketClosed 状态判定 + 输入框 disabled 条件
      // 弱匹配:ticketClosed 或 closedAt 引用 + disabled=...
      expect(
        panelText,
        'ConversationPanel.tsx 必须有 ticketClosed 状态判定 + 输入框 disabled',
      ).toMatch(/(ticketClosed|closedAt)/);
    });
  });
});