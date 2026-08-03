/**
 * fix-ci-008 — 3 个子包 .env.test.example 入仓 + CI 自动复制
 *
 * Why: docker-compose.{yml,test.yml} 通过 env_file 引用 3 个子包的 .env.test,
 * 它们被各子包 .gitignore 排除,fresh CI runner 上不存在,导致 pr-e2e Backend E2E
 * 起步阶段就 FAIL("Failed to load .../ai-cs-demo/.env.test: no such file")。
 *
 * 契约(外部可观察):
 *   - 3 个子包都有 .env.test.example 入仓(非 gitignored)
 *   - 模板里有 test-specific 覆盖(DATABASE_URL → mysql 服务名 / INTERNAL_TOKEN
 *     与根 .env.test.example 一致 / 各服务 URL 用 compose 服务名而非 localhost)
 *   - pr-e2e.yml 有 "Prepare sub-package .env.test" 步骤,缺 .env.test 时复制
 *     .env.test.example;若 .env.test.example 也不存在则 FAIL(非静默放行)
 *   - 根 .env.test.example 含 APP_ENV=test,让 compose 解析 env_file 路径时
 *     走 test 而不是兜底 production
 *
 * @status implemented
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(__dirname, '..', '..');

const SUBPACKAGES = [
  {
    name: 'erp-admin-backend',
    expectedKeys: [
      'DATABASE_URL',
      'CHROMA_URL',
      'INTERNAL_TOKEN',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
    ],
  },
  {
    name: 'erp-admin-frontend',
    expectedKeys: ['VITE_API_BASE_URL', 'VITE_PROXY_TARGET', 'VITE_INTERNAL_TOKEN'],
  },
  {
    name: 'ai-cs-demo',
    expectedKeys: [
      'APP_ENV',
      'NODE_ENV',
      'ERP_ADMIN_URL',
      'CHROMA_URL',
      'INTERNAL_TOKEN',
      'CHAT_MODEL',
    ],
  },
] as const;

/** 把 .env 模板解析成 Record<key, value>,忽略空行与 # 注释 */
function parseEnvTemplate(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = value;
  }
  return out;
}

describe('fix-ci-008: 3 子包 .env.test.example 入仓 + CI 自动复制', () => {
  describe('Given 3 个子包', () => {
    describe.each(SUBPACKAGES)('$name/.env.test.example', (pkg) => {
      it('Then 文件存在且非空', () => {
        const p = resolve(ROOT, pkg.name, '.env.test.example');
        expect(existsSync(p)).toBe(true);
        const stat = statSync(p);
        expect(stat.size).toBeGreaterThan(0);
      });

      it('Then 被 git 跟踪(不在 .gitignore 排除范围)', () => {
        // `git check-ignore -v <path>`:exit 0 = 被忽略,exit 1 = 未忽略。
        // 我们要的是 exit 1(=未忽略 = 入仓),所以套一层 try/catch 翻语义。
        const p = resolve(ROOT, pkg.name, '.env.test.example');
        let ignoredAs: string | null = null;
        try {
          ignoredAs = execSync(`git check-ignore -v "${p}"`, {
            cwd: ROOT,
            encoding: 'utf-8',
          }).toString();
        } catch {
          // exit 1 = not ignored = what we want
          ignoredAs = null;
        }
        expect(
          ignoredAs,
          `${pkg.name}/.env.test.example 被 .gitignore 匹配: ${ignoredAs ?? ''} — ` +
            `必须在该子包 .gitignore 里加 !.env.test.example negation`,
        ).toBeNull();
      });

      it('Then 模板含必需 key', () => {
        const text = readFileSync(
          resolve(ROOT, pkg.name, '.env.test.example'),
          'utf-8',
        );
        const parsed = parseEnvTemplate(text);
        for (const key of pkg.expectedKeys) {
          expect(parsed[key], `missing ${key} in ${pkg.name}/.env.test.example`).toBeDefined();
        }
      });
    });
  });

  describe('Given 各子包模板里的关键变量', () => {
    it('Then erp-admin-backend DATABASE_URL 走 compose 服务名 mysql 不是 localhost', () => {
      const parsed = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'erp-admin-backend', '.env.test.example'), 'utf-8'),
      );
      expect(parsed.DATABASE_URL).toContain('@mysql:');
      expect(parsed.DATABASE_URL).not.toContain('127.0.0.1');
      expect(parsed.DATABASE_URL).toContain('/erp_admin_test');
    });

    it('Then erp-admin-backend INTERNAL_TOKEN 与根 .env.test.example 一致', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      const backend = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'erp-admin-backend', '.env.test.example'), 'utf-8'),
      );
      expect(backend.INTERNAL_TOKEN).toBe(root.INTERNAL_TOKEN);
    });

    it('Then ai-cs-demo INTERNAL_TOKEN 与根 .env.test.example 一致', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      const aiCs = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'ai-cs-demo', '.env.test.example'), 'utf-8'),
      );
      expect(aiCs.INTERNAL_TOKEN).toBe(root.INTERNAL_TOKEN);
    });

    it('Then ai-cs-demo APP_ENV=test 与根 .env.test.example 一致', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      const aiCs = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'ai-cs-demo', '.env.test.example'), 'utf-8'),
      );
      expect(root.APP_ENV).toBe('test');
      expect(aiCs.APP_ENV).toBe('test');
    });

    it('Then ai-cs-demo CHROMA_URL / ERP_ADMIN_URL 走 compose 服务名', () => {
      const parsed = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'ai-cs-demo', '.env.test.example'), 'utf-8'),
      );
      expect(parsed.CHROMA_URL).toContain('chroma:');
      expect(parsed.ERP_ADMIN_URL).toContain('erp-admin-backend:');
      expect(parsed.CHROMA_URL).not.toContain('127.0.0.1');
      expect(parsed.ERP_ADMIN_URL).not.toContain('127.0.0.1');
    });

    it('Then erp-admin-frontend VITE_INTERNAL_TOKEN 与根 .env.test.example 一致', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      const frontend = parseEnvTemplate(
        readFileSync(resolve(ROOT, 'erp-admin-frontend', '.env.test.example'), 'utf-8'),
      );
      expect(frontend.VITE_INTERNAL_TOKEN).toBe(root.INTERNAL_TOKEN);
    });
  });

  describe('Given pr-e2e.yml 工作流', () => {
    const workflowPath = resolve(ROOT, '.github/workflows/pr-e2e.yml');

    it('Then 存在 "Prepare sub-package .env.test" 步骤', () => {
      const text = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf-8') : '';
      expect(text).toMatch(/Prepare sub-package \.env\.test/);
    });

    it('Then 步骤对 3 个子包都做 copy', () => {
      const text = readFileSync(workflowPath, 'utf-8');
      expect(text).toMatch(/erp-admin-backend/);
      expect(text).toMatch(/erp-admin-frontend/);
      expect(text).toMatch(/ai-cs-demo/);
    });

    it('Then 子包 .env.test.example 缺失时 FAIL(不静默放行)', () => {
      const text = readFileSync(workflowPath, 'utf-8');
      // 步骤里应有 "缺少 .env.test.example" 的错误分支,且 exit 1
      expect(text).toMatch(/子包环境变量/);
      expect(text).toMatch(/exit 1/);
    });
  });

  describe('Given 根 .env.test.example', () => {
    it('Then 含 APP_ENV=test(让 docker-compose.yml 的 env_file 路径解析到 test)', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      expect(root.APP_ENV).toBe('test');
    });

    it('Then BACKEND_PORT=3002(与 pr-e2e.yml 健康探针一致)', () => {
      const root = parseEnvTemplate(readFileSync(resolve(ROOT, '.env.test.example'), 'utf-8'));
      expect(root.BACKEND_PORT).toBe('3002');
    });
  });
});