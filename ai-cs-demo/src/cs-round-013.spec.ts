/**
 * @status implemented
 * @change-id cs-round-013
 *
 * cs-round-013:**聊天数据全部从接口获取,前端不再做本地持久化**。
 *
 * Why:
 * 之前 sessions(含 messages)+ activeId + frontendId→backendId 映射都写
 * localStorage;出现多个 bug:
 *   - 401 / 网络抖动被当成"后端真空"→ wipe localStorage(cs-session-persist)
 *   - 跨设备状态分裂(localStorage 一台机器一份,DB 一份)
 *   - mount 时机竞速 → 极快点击 + 新会话会被 hydrate guard 跳过 persist
 *
 * 修法:完全去掉聊天相关 localStorage。sessions 来自后端 list;activeId 来自 URL;
 * messages 来自 history 接口。导出按钮临时 fetch。
 *
 * 契约:
 * - ai-cs-demo 源码**不**写 chat 相关的 localStorage(键名 cs_sessions_v1 /
 *   cs_active_session_v1 / cs_backend_session_map_v1)
 * - use-sessions.ts 数据来自 /api/customer/sessions/list
 * - RAGChat 不再 useLayoutEffect 从 activeSession.messages 加载
 * - use-chat-state.ts history fetch 是**唯一**消息加载路径
 * - sessionsReady 状态 + historyLoading state 配合切 session 不闪
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

describe('cs-round-013: 聊天数据全部从接口获取,无 localStorage', () => {
  it('源码不写 cs_sessions_v1(grep 0 命中)', () => {
    const paths = [
      'src/hooks/use-sessions.ts',
      'src/lib/components/RAGChat.tsx',
      'src/hooks/use-chat-state.ts',
    ];
    for (const p of paths) {
      const text = readFileSync(resolve(PKG, p), 'utf-8');
      // 代码行(非注释)不应出现 — 过滤 // 行 + jsdoc 块
      const codeOnly = text
        .split('\n')
        .filter((line) => {
          const t = line.trimStart();
          return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/');
        })
        .join('\n');
      expect(codeOnly, `${p} 不应写 cs_sessions_v1`).not.toMatch(/cs_sessions_v1/);
      expect(codeOnly, `${p} 不应读 cs_sessions_v1`).not.toMatch(
        /getItem\(['"`]cs_sessions_v1/,
      );
    }
  });

  it('源码不写 cs_active_session_v1 / cs_backend_session_map_v1', () => {
    const paths = [
      'src/hooks/use-sessions.ts',
      'src/lib/components/RAGChat.tsx',
      'src/hooks/use-chat-state.ts',
    ];
    for (const p of paths) {
      const text = readFileSync(resolve(PKG, p), 'utf-8');
      const codeOnly = text
        .split('\n')
        .filter((line) => {
          const t = line.trimStart();
          return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/');
        })
        .join('\n');
      expect(codeOnly, `${p} 不应写 cs_active_session_v1`).not.toMatch(
        /cs_active_session_v1/,
      );
      expect(codeOnly, `${p} 不应写 cs_backend_session_map_v1`).not.toMatch(
        /cs_backend_session_map_v1/,
      );
    }
  });

  it('use-sessions.ts mount 走 /api/customer/sessions/list', () => {
    const path = resolve(PKG, 'src/hooks/use-sessions.ts');
    const text = readFileSync(path, 'utf-8');
    expect(text).toMatch(/\/api\/customer\/sessions\/list/);
    // 不再 loadSessions / loadActiveId / persistSessions / persistActiveId 函数定义
    expect(text).not.toMatch(/function\s+loadSessions\s*\(/);
    expect(text).not.toMatch(/function\s+loadActiveId\s*\(/);
    expect(text).not.toMatch(/function\s+persistSessions\s*\(/);
    expect(text).not.toMatch(/function\s+persistActiveId\s*\(/);
  });

  it('use-sessions.ts Session 类型不含 messages 字段', () => {
    const path = resolve(PKG, 'src/hooks/use-sessions.ts');
    const text = readFileSync(path, 'utf-8');
    // Session interface 块内不应有 messages 字段。
    // 通过匹配 `export interface Session { ... }` 块,扫里面的 `messages: ...` 行。
    const interfaceMatch = text.match(/export interface Session \{([\s\S]*?)\n\}/);
    expect(interfaceMatch, '应找到 Session interface 块').not.toBeNull();
    if (interfaceMatch) {
      const sessionBody = interfaceMatch[1];
      expect(sessionBody, 'Session interface 内不应有 messages 字段').not.toMatch(
        /^\s*messages\s*:/m,
      );
    }
  });

  it('RAGChat 不再用 useLayoutEffect 从 activeSession.messages 加载', () => {
    const path = resolve(PKG, 'src/lib/components/RAGChat.tsx');
    const text = readFileSync(path, 'utf-8');
    expect(text).not.toMatch(/useLayoutEffect/);
    // 不再有 setMessages(.*\.messages) 这种从 sessions 灌消息进 useChat 的模式
    expect(text).not.toMatch(/setMessages\(target\.messages\)/);
    expect(text).not.toMatch(/setMessages\(deduped\)/);
  });

  it('use-chat-state.ts 不再依赖 loadedFromLocalRef', () => {
    const path = resolve(PKG, 'src/hooks/use-chat-state.ts');
    const text = readFileSync(path, 'utf-8');
    const codeOnly = text
      .split('\n')
      .filter((line) => {
        const t = line.trimStart();
        return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/');
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/loadedFromLocalRef/);
    // 一定有 setHistoryLoading(切 session loading 网关)
    expect(text).toMatch(/setHistoryLoading/);
  });

  it('ensureBackendSession / loadBackendMap / saveBackendMap 文件已删除', () => {
    // frontendId→backendId 映射不需要了;activeId 已是后端数字 id
    expect(() =>
      readFileSync(resolve(PKG, 'src/lib/backend-session.ts'), 'utf-8'),
    ).toThrow();
  });
});