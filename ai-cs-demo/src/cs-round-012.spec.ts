/**
 * @status implemented
 * @change-id cs-round-012
 *
 * cs-round-012:use-chat-state 不再因 localStorage 短路 /history fetch
 *
 * Why:cs-round-011 修复未生效的根因。use-chat-state 在 loadedFromLocalRef=true
 * 时短路 /history fetch → 用户刷新进入页面只看到 localStorage 里的 user 消息,
 * DB 里的 assistant 占位 + 自动续推 metadata 永远到不了前端。
 *
 * 契约:
 *  - use-chat-state.ts 必须**永远** fetch /history(不再因 loadedFromLocalRef=true 短路)
 *  - diff/append:setMessages((prev) => [...prev, ...newFromBackend])
 *    后端有但本地没有的 message append,本地有就不覆盖(避免闪烁)
 *  - refetch-history.ts 暴露纯函数 storedToUIMessages(stored),两处复用
 *  - 后端 /history 返回 0 条消息时,setMessages 不该被调
 *
 * 落点:co-located 单测(vitest)。组件级 e2e 行为由 use-chat-state.test.ts 覆盖。
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');

describe('cs-round-012: use-chat-state 不再短路 /history', () => {
  it('use-chat-state.ts 删除了 loadedFromLocalRef 短路', () => {
    const path = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
    const text = readFileSync(path, 'utf-8');
    expect(text).not.toMatch(/if\s*\(\s*loadedFromLocalRef\.current\s*\)\s*return/);
    // diff/append 模式:setMessages(prev => [...prev, ...newFromBackend])
    expect(text).toMatch(/newFromBackend|localIds/i);
  });

  it('refetch-history.ts 暴露纯函数 storedToUIMessages', () => {
    const path = resolve(ROOT, 'ai-cs-demo/src/lib/refetch-history.ts');
    const text = readFileSync(path, 'utf-8');
    expect(text).toMatch(/export function storedToUIMessages/i);
    // refetchSessionHistory 包装函数仍然存在(给 useRealtime / RAGChat 用)
    expect(text).toMatch(/export function refetchSessionHistory/i);
    expect(existsSync(path)).toBe(true);
  });

  it('use-chat-state.ts 引用 storedToUIMessages 做转换', () => {
    const path = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.ts');
    const text = readFileSync(path, 'utf-8');
    expect(text).toMatch(/import\s*\{\s*storedToUIMessages\s*\}/);
    expect(text).toMatch(/storedToUIMessages\(/);
  });

  it('use-chat-state.test.ts 覆盖 diff/append 行为', () => {
    const path = resolve(ROOT, 'ai-cs-demo/src/hooks/use-chat-state.test.ts');
    const text = readFileSync(path, 'utf-8');
    // 必须含 cs-round-012 的 2 个新 case 关键字
    expect(text).toMatch(/cs-round-012/i);
    expect(text).toMatch(/newFromBackend|diff\/append/i);
    // 必须不再断言 'skips /history fetch when loadedFromLocalRef.current=true'
    expect(text).not.toMatch(/skips \/history fetch when loadedFromLocalRef\.current=true/);
  });
});