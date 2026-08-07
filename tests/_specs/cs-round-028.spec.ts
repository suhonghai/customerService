/**
 * @status draft
 * @change-id cs-round-028
 * // @cross-package: ai-cs, backend, frontend
 *
 * cs-round-028:工单 ↔ 会话脱钩修复(三处:ai-cs 上游 / 后端静默回退 / 前端可见性)
 *
 * Why:
 *   生产环境工单 T-20260807001 在 ERP 工单详情页「对话流」Tab 看不到消息。根因三段式:
 *     1) ai-c-demo 上游传错:ChatView.tsx 把数字 sessionId("285") 当成 string
 *        sessionKey 塞给 EscalateButton,真正格式 "cs-1786085192010-p4vw64ll"。
 *     2) 后端静默掩盖:internal.service.ts:494-501 查不到 sessionKey 时只 warn,继续
 *        创建 sessionId=null 工单 — 把 P0 bug 变成"看似成功,实际工单孤儿"。
 *     3) 前端不可见:use-conversation.ts 拉历史 4xx/5xx 只 console.error,不 toast /
 *        红条;运营无法感知数据缺失,反复以为是「页面没刷新」。
 *
 * Spec 契约(根 spec 走代码契约 grep + 文件读取,无需 MySQL 容器):
 *
 *   A. ChatView 传给 EscalateButton 的 sessionKey 来源必须是 string sessionKey,
 *      禁止从 activeId(数字 sessionId 字符串)取。
 *
 *   B. internal.service.ts createEscalation:sessionKey 解析失败时必须抛 BizException,
 *      不得 silently null 创建。
 *
 *   C. ERP 前端 use-conversation / ConversationPanel:拉历史 4xx/5xx 必须有可见信号
 *      (state / toast / 红条),不能只 console.error。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');

// helper: 过滤掉注释行(同 cs-round-014 / 026)
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

describe('cs-round-028: ai-cs 转人工必须让 cs_ticket.session_id 落到正确的 cs_session', () => {
  // ── 契约 A:ChatView 传给 EscalateButton 的 sessionKey 不能来自 activeId(数字) ──
  describe('Given: ai-cs-demo ChatView.tsx 渲染 EscalateButton', () => {
    it('Then: EscalateButton 的 sessionKey prop 来源不能是 activeId(数字 sessionId 字符串)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/ChatView.tsx');
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 反例:sessionKey={activeId ?? ''} 这种直接拿 activeId 的写法应被禁
      const badUsage = text.match(/sessionKey\s*=\s*\{\s*activeId\b[^}]*\}/);
      expect(
        badUsage?.[0] ?? '',
        'ChatView.tsx 禁止把 activeId(数字 sessionId 字符串) 当 sessionKey 传,'
          + '应从 useSessions 返回的 string sessionKey 字段取',
      ).toBe('');
    });

    it('Then: EscalateButton 必须收到 string 类型的 sessionKey prop(string 类型 token,如 activeSessionKey)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/ChatView.tsx');
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 查找 EscalateButton JSX 块
      const ebIdx = text.indexOf('<EscalateButton');
      expect(ebIdx, 'ChatView 应渲染 <EscalateButton>').toBeGreaterThanOrEqual(0);
      // 抠出 EscalateButton 块(到下一个 `/` 闭合或 `/>`)
      let depth = 0;
      let i = ebIdx;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '<') depth++;
        else if (ch === '>') {
          depth--;
          if (depth <= 0) break;
        }
        i++;
      }
      const ebBlock = text.slice(ebIdx, i + 1);

      // sessionKey={...} 表达式必须不是空串、不能用 activeId
      // 必须包含一个形如 activeSessionKey 或 string-typed 变量的赋值
      const sessionKeyProp = ebBlock.match(/sessionKey\s*=\s*\{([^}]+)\}/);
      expect(
        sessionKeyProp?.[1] ?? '',
        'EscalateButton 必须显式传 sessionKey prop',
      ).toBeTruthy();

      const expr = (sessionKeyProp?.[1] ?? '').trim();
      expect(expr).not.toBe('');
      expect(
        expr,
        'sessionKey 不能来自 activeId(数字 ID 字符串)',
      ).not.toMatch(/^\s*activeId\b/);
      // 必须有一个非空 fallback(避免传空字符串把后端 silently null 化)
      // 形如 `?? '<non-empty>'` 或 `|| '<non-empty>'`
      // 允许:`activeSessionKey ?? ''` 或 `activeSessionKey || 'unknown'`
      // 不允许:`''`(裸空串)
      const emptyLiteral = expr.match(/^\s*['"]['"]\s*$|^\s*['"`]undefined['"`]\s*$/);
      expect(
        emptyLiteral?.[0] ?? '',
        'sessionKey 不应是裸空串/undefined 字面量',
      ).toBe('');
    });

    it('Then: ChatViewProps 接口应声明 string 类型的 sessionKey 字段(供 EscalateButton 透传)', () => {
      const p = resolve(ROOT, 'ai-cs-demo/src/components/chat/ChatView.tsx');
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 接口必须声明一个 string 类型的 sessionKey 相关字段
      // 允许:activeSessionKey / sessionKey / chatSessionKey
      // 类型:string 或 string | null
      const propDecl = text.match(
        /\b(activeSessionKey|sessionKey|chatSessionKey)\s*:\s*string(\s*\|\s*null)?\s*;/,
      );
      expect(
        propDecl?.[0] ?? '',
        'ChatViewProps 必须声明 string 类型 sessionKey 字段(string 或 string | null)',
      ).toBeTruthy();
    });
  });

  // ── 契约 B:internal.service.ts createEscalation sessionKey 解析失败必须抛错 ──
  describe('Given: erp-admin-backend internal.service.ts createEscalation', () => {
    it('Then: dto.sessionKey 存在但 cs_session 未命中时,必须 throw,不得 silently null 创建', () => {
      const p = resolve(
        ROOT,
        'erp-admin-backend/src/modules/internal/internal.service.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 抠出 createEscalation 整个方法体
      const m = text.match(
        /async\s+createEscalation\s*\([^)]*\)\s*\{/,
      );
      expect(m?.[0] ?? '', 'createEscalation 方法必须存在').toBeTruthy();
      const startIdx = m!.index!;
      let depth = 0;
      let i = startIdx;
      let started = false;
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

      // 反例:`if (!sessionRow) { logger.warn(...); }` 后继续 fall-through 创建工单 — 应被禁
      // 允许的形式:throw new BizException(...) / throw new BadRequestException(...) / throw new Error(...)
      const silentFallthrough =
        /if\s*\(\s*!sessionRow\s*\)\s*\{[^}]*logger\.(?:warn|log|error)[^}]*\}\s*(?!throw)/.test(
          methodBody,
        );
      expect(
        silentFallthrough,
        'createEscalation 禁止 silently fallthrough:sessionKey 未命中时必须 throw,'
          + '不得只 logger.warn 后继续创建 sessionId=null 工单',
      ).toBe(false);

      // 正向契约:必须有 throw 路径
      const hasThrowOnMiss =
        /if\s*\(\s*!sessionRow\s*\)\s*\{[\s\S]*?throw\s+new\s+\w+/.test(methodBody);
      expect(
        hasThrowOnMiss,
        'createEscalation 在 !sessionRow 时必须有 throw new BizException(...) 之类',
      ).toBe(true);
    });
  });

  // ── 契约 C:ERP 前端 use-conversation 拉历史失败必须有可观察信号 ──
  describe('Given: erp-admin-frontend use-conversation.ts + ConversationPanel.tsx', () => {
    it('Then: use-conversation 拉历史 4xx/5xx 必须有 setError / setLoadError 类状态更新,不只 console.error', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/hooks/use-conversation.ts',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须有 setError / setLoadError / setHistoryError 之类的 state setter 调用
      // 不允许:只有 console.error
      const errorSetterCalls = [
        ...text.matchAll(
          /\bset(?:Error|LoadError|HistoryError|LoadHistoryError)\s*\(/g,
        ),
      ];
      expect(
        errorSetterCalls.length,
        'use-conversation 拉历史失败必须 setError (或等价) — 不能只 console.error',
      ).toBeGreaterThanOrEqual(1);

      // 该 setter 必须在 .catch 块内被调用(不能只在某个无关地方)
      const catchBlockMatch = text.match(/\.catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
      expect(catchBlockMatch?.[1] ?? '', '.catch 块必须存在').toBeTruthy();
      expect(
        catchBlockMatch?.[1] ?? '',
        '.catch 块内必须调 setError 而非只 console.error',
      ).toMatch(/\bset(?:Error|LoadError|HistoryError|LoadHistoryError)\s*\(/);
    });

    it('Then: ConversationPanel 必须根据 useConversation 的 error state 渲染可观察错误 UI(红条 / banner)', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/components/ConversationPanel.tsx',
      );
      expect(existsSync(p)).toBe(true);
      const text = stripComments(readFileSync(p, 'utf-8'));

      // 必须从 useConversation 解构出 error / loadError 之类
      const destructuresError = text.match(
        /\bconst\s*\{[^}]*\b(error|loadError|historyError|loadHistoryError)\b[^}]*\}\s*=\s*useConversation\s*\(/,
      );
      expect(
        destructuresError?.[0] ?? '',
        'ConversationPanel 必须从 useConversation 解构 error 字段',
      ).toBeTruthy();

      // JSX 内必须根据 error 渲染可见元素(Alert / message.error / 红条)
      // 宽松匹配:有 error 时显示 antd Alert / message / 红条
      const hasErrorRendering =
        /\bAlert\b/.test(text) ||
        /\bantdMessage\.(?:error|warning)\s*\(/.test(text) ||
        /\bantdMessage\.error/.test(text) ||
        /className=["'][^"']*error[^"']*["']/i.test(text) ||
        /color:\s*['"]#?(?:ff4d4f|f5222d|dc3545|red)/i.test(text);
      expect(
        hasErrorRendering,
        'ConversationPanel 必须渲染 error 时的可见 UI(Alert / message.error / 红条 / 红色文字)',
      ).toBe(true);
    });

    it('Then: loading 分支禁止用 antd Spin.tip(default 模式静默丢弃 + 触发 console warning),必须显式渲染文案', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/components/ConversationPanel.tsx',
      );
      const text = readFileSync(p, 'utf-8');

      // 抠出 loading 分支(同 spec 其它 loading 分支的抠法)
      const loadingMatch = text.match(/if\s*\(\s*loading\s*\)/);
      expect(loadingMatch?.[0] ?? '', '必须存在 if (loading) 分支').toBeTruthy();
      const branchStart = text.indexOf(loadingMatch![0]);
      let depth = 0;
      let started = false;
      let i = branchStart;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          if (started && depth === 0) break;
          depth--;
        }
        i++;
      }
      const branchBody = text.slice(branchStart, i + 1);

      // 反例:不能写 `<Spin tip="..." />`(antd default 模式 tip 静默丢弃)
      expect(
        branchBody,
        'loading 分支禁止使用 Spin tip prop(default 模式不生效且会 console warning)',
      ).not.toMatch(/<Spin\b[^>]*\btip\s*=/);

      // 正向契约:必须有可观察的「加载对话」类文本(可在 Spin 兄弟节点、Skeleton、children 等)
      expect(
        branchBody,
        'loading 分支必须有「加载对话」类可观察文本',
      ).toMatch(/加载对话|Loading|loading\.\.\./);
    });

    it('Then: sessionId=null 分支必须显示「未关联会话」类明确提示,且应给排查线索', () => {
      const p = resolve(
        ROOT,
        'erp-admin-frontend/src/components/ConversationPanel.tsx',
      );
      const text = readFileSync(p, 'utf-8');

      // 必须有 sessionId 为 falsy 时的分支
      const nullBranch = text.match(/if\s*\(\s*!sessionId\s*\)/);
      expect(nullBranch?.[0] ?? '', '必须存在 !sessionId 分支').toBeTruthy();

      // 该分支的渲染必须有中文可观察文本:含「未关联会话」或类似
      // 抠出该 if 块(到匹配的 `return ...;` 或 `}`)
      const branchIdx = text.indexOf(nullBranch![0]);
      let depth = 0;
      let i = branchIdx;
      let started = false;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '{') {
          depth++;
          started = true;
        } else if (ch === '}') {
          if (started && depth === 0) break;
          depth--;
        } else if (ch === ';' && started && depth === 0) {
          // 单独的 ; 也算结束(单行 if)
          i++;
          break;
        }
        i++;
      }
      const branchBody = text.slice(branchIdx, i + 1);

      expect(
        branchBody,
        '!sessionId 分支渲染必须包含「未关联会话」类可观察中文文本',
      ).toMatch(/未关联会话|没有会话|未绑定会话/);
    });
  });
});