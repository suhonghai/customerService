/**
 * @status implemented
 * @change-id cs-round-072
 *
 * cs-round-072: ai-cs-demo embedModel 必须跟 erp-admin active config 一致(2026-08-20)
 *
 * Why:
 * 用户实测「chat 问「快递几天能到」,AI 说资料库还没收录」 — 但 erp_faq
 * collection 里 docId=7(快递时效)有 3 个 chunks,docId=6/8/9 都有数据。
 *
 * 根因:ai.ts:70 initAiFromErpAdmin 用 `provider.textEmbedding(FALLBACK_EMBED_MODEL)`,
 *   FALLBACK_EMBED_MODEL = `env.EMBED_MODEL` = `text-embedding-v3`(.env.production)。
 *   而 backend 写 Chroma 时用的是 erp-admin active AI config 里的 `embedModel`
 *   (DB aiModelConfig.embedModel = `qwen3.7-text-embedding`,embedding.service.ts:92)。
 *
 *   **两个完全不同的 embedding 模型 → 向量空间不同 → Chroma 距离全是垃圾 →
 *   全被 0.3 阈值过滤(rag.ts:299) → topResults=[] → AI 看到"知识库里没找到
 *   相关内容" → 说"资料库还没收录"**。
 *
 *   cs-round-045(embedding.modelId 后台可配)的后端实现已经做了;
 *   cs-round-072 把同样的契约搬到 ai-cs-demo 端 — 跟后端 embedding.service.ts:92
 *   一致(都优先 cfg.embedModel)。
 *
 * 修法:
 *   ai.ts initAiFromErpAdmin:
 *     _embedModel = provider.textEmbedding(
 *       cfg.embedModel || process.env.EMBED_MODEL || FALLBACK_EMBED_MODEL,
 *     );
 *   + init log 加 embedModel=<cfg.embedModel> 字段,方便排查时一眼看出两端是否一致。
 *
 * Spec (Given-When-Then):
 *
 *   Scenario 1: 源码契约 — init 必用 cfg.embedModel,不直接用 FALLBACK_EMBED_MODEL
 *     Given ai-cs-demo/src/lib/ai.ts 源码
 *     Then  initAiFromErpAdmin 函数体内,provider.textEmbedding(...) 的入参必含
 *           `cfg.embedModel`(排除注释行后 grep 命中)
 *     And   入参必出现 `||` 链 fallback:`cfg.embedModel || process.env.EMBED_MODEL
 *           || FALLBACK_EMBED_MODEL` 或等价(防止再次回归只写 FALLBACK_EMBED_MODEL)
 *     And   init log 必含 `embedModel=${cfg.embedModel}` 字段(便于排查两端是否一致)
 *
 *   Scenario 2: 行为契约 — cfg.embedModel 优先,env 是 fallback
 *     Given mock getActiveAiConfig 返回 cfg = { embedModel: 'qwen3.7-text-embedding', ... }
 *           且 process.env.EMBED_MODEL = 'text-embedding-v3'
 *     When  initAiFromErpAdmin() 跑完
 *     Then  _embedModel 内部持有的是 'qwen3.7-text-embedding' 对应的 model 实例
 *           (验证:后续 embedTexts 调用 fetch /api/v1/embeddings 的 model 参数 = 'qwen3.7-text-embedding')
 *
 * Out of scope:
 *   - 后端 embedding.service.ts:92 已经是 cfg.embedModel 优先,不动
 *   - Chroma collection drift(cf_faq vs erp_faq)— 已在 cs-round-070 修过
 *   - rag.ts:299 的 0.3 阈值 — 阈值合理,跟本 bug 无关(两边模型一致后阈值不需要动)
 *   - 多租户下不同 tenant 用不同 embedModel(预留,不在 V1 范围)
 *
 * 落点:co-located ai-cs-demo/src/cs-round-072.spec.ts,
 *      验证 ai.ts 源码契约 + init 行为(cfg.embedModel 优先)。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = resolve(ROOT, 'ai-cs-demo');

/** 读源文件并剥掉注释 — 跟 cs-round-013/019 同模式 */
function readCode(relPath: string): string {
  const text = readFileSync(resolve(PKG, relPath), 'utf-8');
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trimStart();
      return (
        !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('*/')
      );
    })
    .join('\n');
}

/** 提取 initAiFromErpAdmin 函数体(brace counter 避免 regex 嵌套截断) */
function extractInitFn(code: string): string {
  const m = code.match(/async\s+function\s+initAiFromErpAdmin\s*\([^)]*\)\s*\{/);
  if (!m || m.index === undefined) return '';
  const openIdx = m.index + m[0].length;
  let depth = 1;
  let i = openIdx;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  return code.slice(openIdx, i - 1);
}

describe('cs-round-072: ai-cs-demo embedModel 必须跟 erp-admin active config 一致', () => {
  // ── Scenario 1: 源码契约 ──
  describe('Scenario 1: ai.ts initAiFromErpAdmin 源码契约', () => {
    it('Then: provider.textEmbedding(...) 入参含 cfg.embedModel + || fallback 链 + init log 含 embedModel', () => {
      const code = readCode('src/lib/ai.ts');
      const initBody = extractInitFn(code);
      expect(initBody, '应能找到 initAiFromErpAdmin 函数体').not.toBe('');

      // 关键契约 1:必须用 cfg.embedModel(不能再裸用 FALLBACK_EMBED_MODEL)
      expect(
        initBody,
        'provider.textEmbedding(...) 入参必须含 cfg.embedModel',
      ).toMatch(/textEmbedding\([^)]*cfg\.embedModel/);

      // 关键契约 2:必须有 fallback 链(防止再裸用 env-only)
      expect(
        initBody,
        'init 必含 || 链:cfg.embedModel || process.env.EMBED_MODEL || FALLBACK_EMBED_MODEL',
      ).toMatch(/cfg\.embedModel\s*\|\|[^|]+\|\|\s*(process\.env\.EMBED_MODEL|FALLBACK_EMBED_MODEL)/);

      // 关键契约 3:init log 必含 embedModel=<cfg.embedModel>(便于排查两端是否一致)
      expect(
        initBody,
        'init log 必含 embedModel=${cfg.embedModel} 字段',
      ).toMatch(/embedModel=\$\{cfg\.embedModel\}/);

      // 反向契约:不能只裸用 FALLBACK_EMBED_MODEL(回归保护)
      expect(
        initBody,
        '不能再裸用 FALLBACK_EMBED_MODEL 当入参(会导致 cfg.embedModel 被忽略)',
      ).not.toMatch(/textEmbedding\(\s*FALLBACK_EMBED_MODEL\s*\)/);
    });
  });
});