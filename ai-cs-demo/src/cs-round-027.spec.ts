/**
 * @status implemented
 * @change-id cs-round-027
 *
 * cs-round-027:useAutoResumeStreaming SSE 解析 — 剥 `data:` 前缀后再 JSON.parse
 *
 * Why(为什么做):
 *   用户报「cs-round-026 转发 SSE 后,网络面板看到 text-delta chunk 一直在推,
 *   但右框 UI 没流式输出」。诊断后发现 useAutoResumeStreaming.resumeOne 的 read 循环
 *   直接 `JSON.parse(line)`,line 是 SSE `data: {...}` 带前缀,JSON.parse 抛 SyntaxError,
 *   被 catch 吞 warn。**handleStreamChunk 永远不被调用**,UI 只剩 W11 fallback / DB
 *   写入驱动的"假象流式"。
 *
 *   cs-round-011 时代这个 bug 就埋下了,被 W11 兜底 + DB 写入掩盖(用户最后能看到完整
 *   答案,但不是实时流式追加的)。cs-round-026 转发 SSE 暴露了它 —— 现在 SSE 一直
 *   推到 streamText 结束,期间 UI 应该持续 append,但实际 0 增量。
 *
 * 修法:抽 `parseSseEvents(buffer)` 命名函数,按 SSE 标准:
 *   - 用 `\n\n`(event boundary)拆 event
 *   - 每个 event 内的 `data:` 行剥前缀再 JSON.parse
 *   - 多行 data: → 拼接(标准 SSE multi-line data)
 *   - 残余(可能未完)返回 rest,下次拼接继续拆
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 标准 SSE 格式 — `data: <json>\n\n` 能解析出 chunk
 *     Given parseSseEvents 入参是 `data: {"type":"text-delta","id":"msg_x","delta":"hi"}\n\n`
 *     When  调 parseSseEvents
 *     Then  events 长度 = 1
 *     And   events[0].type === 'text-delta'
 *     And   events[0].id === 'msg_x'
 *     And   events[0].delta === 'hi'
 *     And   rest === ''(没残余)
 *
 *   Scenario 2: 多 event 顺序 — 多个 \n\n 分隔的 event 都能解析
 *     Given 入参是 `data: {...}\n\ndata: {...}\n\n`
 *     When  parseSseEvents
 *     Then  events 长度 = 2,rest === ''
 *
 *   Scenario 3: 残余 buffer — 没结束的 event 留 rest,下次拼接
 *     Given 入参是 `data: {"type":"text-delta","id":"msg_x","delta":"hel`(缺 \n\n 结束)
 *     When  parseSseEvents
 *     Then  events 长度 = 0,rest === 'data: {"type":"text-delta","id":"msg_x","delta":"hel'
 *
 *   Scenario 4: 残余 + 下次 read 拼接 — 完整 chunk 跨两次 read
 *     Given 第 1 次 read 入参 `data: {"type":"text-start","id":"msg_x"}\n\ndata: {"t` (残余:第 2 个 event 头部)
 *     When  第 1 次 parseSseEvents → rest 含第 2 个 event 头部
 *     And   第 2 次 read 入参 rest + `ype":"text-delta","id":"msg_x","delta":"hi"}\n\n`
 *     Then  第 2 次 parseSseEvents → 1 个新 event(text-delta)+ rest === ''
 *
 *   Scenario 5: 多行 data: 行 → 拼接后 JSON.parse(SSE multi-line data)
 *     Given 入参是 `data: {"type":"text-delta",\ndata: "id":"msg_x","delta":"hi"}\n\n`
 *     When  parseSseEvents
 *     Then  events 长度 = 1,events[0] 是合法对象
 *
 *   Scenario 6: 非法 JSON 静默丢弃 + warn(不抛错)
 *     Given 入参是 `data: not-json\n\n`
 *     When  parseSseEvents
 *     Then  events 长度 = 0(静默丢)
 *     And   不抛错(走 warn 路径)
 *
 *   Scenario 7: 回归 — resumeOne 内的 read loop 必须用 parseSseEvents(不能裸 JSON.parse)
 *     Given use-auto-resume-streaming.ts resumeOne 实现
 *     Then  read 循环内必须调 parseSseEvents(grep 验证)
 *     And   不能直接 JSON.parse(line)(grep 反向断言)
 *
 *   Scenario 8: handleStreamChunk 必须真的被调(grep 验证 resumeOne 调用链不断)
 *     Given resumeOne 实现
 *     Then  parseSseEvents 后必须循环调 handleStreamChunk(grep 验证)
 *
 * Out of scope:
 * - useChat 默认 transport(由 AI SDK 处理,不走这里)— 不动
 * - 服务端 createUIMessageStreamResponse 的 SSE 编码(标准 SSE)— 不动
 * - chunk.id 与 messageId 不匹配的另解(下一轮 if needed)— 本 spec 只修 SSE 解析
 * - W11 fallback 逻辑 — 不动
 *
 * 落点:co-located ai-cs-demo/src/cs-round-027.spec.ts,
 *      验证 parseSseEvents 7 种场景 + resumeOne 调用链 2 条契约。
 */

import { describe, it, expect } from 'vitest';
import { parseSseEvents } from '@/hooks/use-auto-resume-streaming';

describe('cs-round-027: useAutoResumeStreaming SSE 解析(剥 data: 前缀)', () => {
  // ── Scenario 1: 标准 SSE 格式 ──
  describe('Scenario 1: 标准 `data: <json>\\n\\n` 解析', () => {
    it('Then events 长度 = 1,chunk 字段对得上,rest 空', () => {
      const buf = `data: {"type":"text-delta","id":"msg_x","delta":"hi"}\n\n`;
      const { events, rest } = parseSseEvents(buf);
      expect(events).toHaveLength(1);
      expect(rest).toBe('');
      const c = events[0] as { type?: string; id?: string; delta?: string };
      expect(c.type).toBe('text-delta');
      expect(c.id).toBe('msg_x');
      expect(c.delta).toBe('hi');
    });
  });

  // ── Scenario 2: 多 event 顺序 ──
  describe('Scenario 2: 多个 event 顺序解析', () => {
    it('Then events 长度 = 2,rest 空', () => {
      const buf = `data: {"type":"start","messageId":"m1"}\n\ndata: {"type":"finish"}\n\n`;
      const { events, rest } = parseSseEvents(buf);
      expect(events).toHaveLength(2);
      expect(rest).toBe('');
      const c0 = events[0] as { type?: string; messageId?: string };
      const c1 = events[1] as { type?: string };
      expect(c0.type).toBe('start');
      expect(c0.messageId).toBe('m1');
      expect(c1.type).toBe('finish');
    });
  });

  // ── Scenario 3: 残余 buffer ──
  describe('Scenario 3: 残余 buffer — 没结束的 event 留 rest', () => {
    it('Then events 长度 = 0,rest 含残余', () => {
      const buf = `data: {"type":"text-delta","id":"msg_x","delta":"hel`; // 缺 \n\n
      const { events, rest } = parseSseEvents(buf);
      expect(events).toHaveLength(0);
      expect(rest).toBe(buf);
    });
  });

  // ── Scenario 4: 残余 + 下次 read 拼接 ──
  describe('Scenario 4: 残余 + 下次 read 拼接出完整 event', () => {
    it('Then 第 2 次 read 完整解析第 2 个 event', () => {
      // 第 1 次 read:第 1 个 event 完整 + 第 2 个 event 缺 \n\n
      const buf1 = `data: {"type":"text-start","id":"msg_x"}\n\ndata: {"type":"text-delta","id":"msg_x"`;
      const { events: e1, rest: r1 } = parseSseEvents(buf1);
      expect(e1).toHaveLength(1);
      expect((e1[0] as { type?: string }).type).toBe('text-start');
      expect(r1).toBe(`data: {"type":"text-delta","id":"msg_x"`);

      // 第 2 次 read:残余 + 新读到的字节(含 \n\n 结束)
      const buf2 = r1 + `,"delta":"hi"}\n\n`;
      const { events: e2, rest: r2 } = parseSseEvents(buf2);
      expect(e2).toHaveLength(1);
      expect((e2[0] as { type?: string; delta?: string }).type).toBe('text-delta');
      expect((e2[0] as { delta?: string }).delta).toBe('hi');
      expect(r2).toBe('');
    });
  });

  // ── Scenario 5: 多行 data: 行(SSE multi-line data 拼接) ──
  describe('Scenario 5: 多行 data: 行 → 拼接后 JSON.parse', () => {
    it('Then events 长度 = 1,events[0] 是合法对象', () => {
      // SSE multi-line data:每行独立 `data:` 前缀,内容拼成单个 JSON
      const buf = `data: {"type":"text-delta",\ndata: "id":"msg_x","delta":"hi"}\n\n`;
      const { events, rest } = parseSseEvents(buf);
      expect(events).toHaveLength(1);
      expect(rest).toBe('');
      const c = events[0] as { type?: string; id?: string; delta?: string };
      expect(c.type).toBe('text-delta');
      expect(c.id).toBe('msg_x');
      expect(c.delta).toBe('hi');
    });
  });

  // ── Scenario 6: 非法 JSON 静默丢弃 ──
  describe('Scenario 6: 非法 JSON 静默丢弃 + warn,不抛错', () => {
    it('Then events 长度 = 0(静默丢)', () => {
      const buf = `data: not-json\n\n`;
      // 包 try/catch 是因为 parseSseEvents 内部已经 catch;这里再 catch 是为了
      // 测试"不抛错"语义(catch 块里捕获不到 → 实际测试 parseSseEvents 的合约)
      let events: unknown[] = [];
      let rest = '';
      expect(() => {
        const r = parseSseEvents(buf);
        events = r.events;
        rest = r.rest;
      }).not.toThrow();
      expect(events).toHaveLength(0);
      expect(rest).toBe('');
    });
  });

  // ── Scenario 7: 回归 — resumeOne 必须用 parseSseEvents ──
  describe('Scenario 7: 回归 — resumeOne read loop 必须用 parseSseEvents', () => {
    it('Then use-auto-resume-streaming.ts 内 read 循环必须调 parseSseEvents,不能裸 JSON.parse(line)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const text = fs.readFileSync(
        path.resolve(__dirname, 'hooks/use-auto-resume-streaming.ts'),
        'utf-8',
      );
      // 抠出 resumeOne 函数体
      const m = text.match(/async function resumeOne[\s\S]*?\n}\n/);
      expect(m, '应能找到 resumeOne 函数体').toBeTruthy();
      const body = m![0];

      // 必须调 parseSseEvents
      expect(
        body,
        'resumeOne read loop 必须调 parseSseEvents',
      ).toMatch(/parseSseEvents\s*\(/);

      // 反向断言:read loop 内不能再裸 JSON.parse(line)
      // 注意:parseSseEvents 内部合法 JSON.parse(buf) 是 OK 的;这里只检查 resumeOne 自己不裸 parse
      const directParse = /JSON\.parse\s*\(\s*line\s*\)/.test(body);
      expect(
        !directParse,
        'resumeOne read loop 不应再直接 JSON.parse(line)(已迁移到 parseSseEvents)',
      ).toBe(true);
    });
  });

  // ── Scenario 8: handleStreamChunk 必须真被调 ──
  describe('Scenario 8: handleStreamChunk 调用链不断', () => {
    it('Then parseSseEvents 后必须循环 handleStreamChunk(grep 验证)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const text = fs.readFileSync(
        path.resolve(__dirname, 'hooks/use-auto-resume-streaming.ts'),
        'utf-8',
      );
      const m = text.match(/async function resumeOne[\s\S]*?\n}\n/);
      expect(m).toBeTruthy();
      const body = m![0];

      // 必须有 handleStreamChunk 调用
      expect(
        body,
        'parseSseEvents 返回 events 后必须 handleStreamChunk(...events)',
      ).toMatch(/handleStreamChunk\s*\(/);
    });
  });
});