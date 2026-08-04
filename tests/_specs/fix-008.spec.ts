/**
 * fix-008 — ai-cs-demo `pnpm exec tsc --noEmit` 必须 exit 0
 *
 * Why: CI 在 ai-cs-demo pr-tests.yml 跑 tsc 作为硬门禁(issue #22),目前 30+
 * TS 编译错误让 PR 永远红。错误分四类:
 *   1. **zod v4 升级未适配** — define-tool.ts FlexibleSchema 类型不匹配
 *   2. **AI SDK 6.x UIMessage** — text-start/text-delta/text-end 没有 messageId 字段
 *   3. **NextConfig 新字段** — next.config.ts eslint 不在 NextConfig 类型
 *   4. **env schema 缺项** — get-weather.ts 缺 WEATHER_API_URL / WEATHER_API_KEY
 *
 * 此外还有一批非 #22 描述但同次扫到的 TS 错(组件类型 / 测试 matcher / parser
 * 类型 / rag 类型等),同 PR 一起修,因为单独走会让 CI 一直红。
 *
 * 契约(外部可观察):
 *   - pnpm --filter v1-ai-cs-demo exec tsc --noEmit exit 0
 *   - exit 0 包含「完全无 error TS」语义(不只是 exit code 0,grep 应为空)
 *   - 这个 PR 不引入新功能,只修类型 + 必要的实现配合
 *
 * @status implemented
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();

describe('fix-008: ai-cs-demo tsc 必须 exit 0', () => {
  it('Given ai-cs-demo 包,When 跑 pnpm exec tsc --noEmit,Then exit 0 且无 error TS', () => {
    // 把命令输出 + exit code 都拿出来,任何 error TS:xxxx 行都不能出现
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    try {
      ({ stdout, stderr } = execSync(
        'pnpm --filter v1-ai-cs-demo exec tsc --noEmit',
        {
          cwd: ROOT,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180_000,
        },
      ));
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      stdout = e.stdout ?? '';
      stderr = e.stderr ?? '';
      exitCode = e.status ?? 1;
    }

    // 1. exit code 必须是 0
    expect(exitCode, `tsc exit code: ${exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);

    // 2. stdout / stderr 中不能含任何 "error TS" 行
    //    (防御:有些 tsc 配置可能在 exit 0 的同时还输出 error,虽然罕见)
    const combined = `${stdout}\n${stderr}`;
    const errorLines = combined
      .split('\n')
      .filter((line) => /error TS\d+/.test(line));
    expect(errorLines, `tsc 输出含 error TS:\n${errorLines.join('\n')}`).toEqual([]);
  }, 200_000); // vitest timeout 200s,tsc 在慢机器上可能跑 1-2 分钟
});