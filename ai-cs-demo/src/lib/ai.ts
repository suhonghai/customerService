import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { getActiveAiConfig, peekCachedAiConfig } from './ai-config';
import { env, isTest } from './env';

/**
 * ai.ts(Day 9 重构)
 *
 * 原架构:静态读 env.DASHSCOPE_API_KEY + CHAT_MODEL 硬编码
 * 新架构:启动时从 erp-admin 拉 active AI 配置(明文 apiKey),缓存 1h
 *
 * - 旧 export(qwen / qwenChat / qwenEmbed / CHAT_MODEL / EMBED_MODEL)保留兼容
 *   但底层换成读 ai-config 缓存
 * - 新增 getChatModel() 供需要 dynamic 拿模型实例的场景
 *
 * 兼容:
 *   如果 erp-admin 不可达(开发/测试),降级用 env.DASHSCOPE_API_KEY + env.CHAT_MODEL
 *   这样老的本地开发体验不变
 */

// ============================================================
// 降级 fallback(erp-admin 不可达时用)
// ============================================================

const FALLBACK_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const FALLBACK_CHAT_MODEL = env.CHAT_MODEL || 'qwen-plus';
const FALLBACK_EMBED_MODEL = env.EMBED_MODEL || 'text-embedding-v3';

/**
 * 用 fallback 立即构造一个 qwen provider(同步,用于启动降级)
 */
function makeFallbackProvider() {
  return createOpenAI({
    name: 'qwen',
    baseURL: env.DASHSCOPE_BASE_URL || FALLBACK_BASE_URL,
    apiKey: env.DASHSCOPE_API_KEY || 'fallback-missing-key',
  });
}

const _fallback = makeFallbackProvider();
export const qwen = _fallback;

// ============================================================
// 异步初始化(启动时调一次,失败降级)
// ============================================================

let _chatModel: ReturnType<ReturnType<typeof createOpenAI>> | null = null;
let _embedModel: ReturnType<ReturnType<typeof createOpenAI>['textEmbedding']> | null = null;

/**
 * 启动时调用(从 .next/server 启动钩子 / 第一次请求时懒加载都行)
 * 拉 erp-admin active AI 配置,构造 chat / embed 模型
 * 失败 → 降级用 env
 *
 * W11 改动:移除 `_initialized` 一锁到底 —— 之前的设计是只 init 一次,但
 *   万一第一次 init 失败(网络瞬断 / erp-admin 还没起),后续 peek cache 为 null
 *   也不会重试,永远 fallback-missing-key → Unauthorized。
 *   现在每次调用都重新尝试(getActiveAiConfig 自带 1h cache,不会打爆),
 *   确保 chat 路径一定能拿到 active cfg 的真凭证。
 */
export async function initAiFromErpAdmin(): Promise<void> {
  try {
    const cfg = await getActiveAiConfig({ force: true });
    const provider = createOpenAI({
      name: cfg.provider,
      baseURL: cfg.baseUrl || env.DASHSCOPE_BASE_URL || FALLBACK_BASE_URL,
      apiKey: cfg.apiKey,
    });
    _chatModel = provider(cfg.modelId);
    // cs-round-072:必须用 cfg.embedModel(从 erp-admin 拉),不能用 FALLBACK_EMBED_MODEL(env)。
    //   backend writing Chroma 时也用 cfg.embedModel(`qwen3.7-text-embedding`),
    //   ai-cs-demo query Chroma 用 `text-embedding-v3` / `text-embedding-v4`
    //   → 不同 embedding 模型 → 向量空间完全不同 → Chroma 距离全是垃圾 →
    //   全被 0.3 阈值过滤 → AI 永远说"知识库没收录"。
    //   实测 prod: erp_faq collection 有 14 chunks(docId=6,7,8,9 都有),
    //   query "快递一般几天能到" topResults=[]。
    //   修法跟 backend embedding.service.ts:92 一致(都优先 cfg.embedModel)。
    _embedModel = provider.textEmbedding(
      cfg.embedModel || process.env.EMBED_MODEL || FALLBACK_EMBED_MODEL,
    );
    if (!isTest) {
      console.log(
        `[ai] inited from erp-admin: modelId=${cfg.modelId} embedModel=${cfg.embedModel} provider=${cfg.provider} baseUrl=${cfg.baseUrl}`,
      );
    }
  } catch (e) {
    // 用 console.log 而非 console.warn(Node.js console.warn 写 stderr,
    // Next.js production 下 stderr 不一定被 docker logs 捕获,
    // 这里用 stdout 保证排查时能看见)
    console.log(`[ai] erp-admin active config 拉取失败,降级 env: ${(e as Error).message}`);
    // 不再 set _chatModel = fallback —— 让 getChatModel() 走 cache 优先分支,
    // 下次有真 cfg 时自然覆盖。fallback 只有在 cache + _chatModel 都没时才用。
  }
}

/**
 * 取当前生效的 chat model 实例
 * 优先用 erp-admin 配置;若未 init 或失败 → fallback
 *
 * 关键:W11 改动 —— 每次调用都先看 peekCachedAiConfig() 的最新值,
 *   因为 1h cache 可能在进程内被 initAiFromErpAdmin() 更新,
 *   _chatModel 是 init 时拍的快照,可能在 init 失败/降级时被设成 fallback。
 *   直接看 cache 拿到的是 erp-admin 返回的真 apiKey + modelId,
 *   拿到就能用真凭证,而不是 fallback-missing-key。
 */
export function getChatModel() {
  // 每次先看 cache(1h 内可能已被刷成新配置)
  const cfg = peekCachedAiConfig();
  if (cfg && cfg.apiKey) {
    const provider = createOpenAI({
      name: cfg.provider,
      baseURL: cfg.baseUrl || env.DASHSCOPE_BASE_URL || FALLBACK_BASE_URL,
      apiKey: cfg.apiKey,
    });
    _chatModel = provider(cfg.modelId);
    return _chatModel;
  }
  // cache 没拿到(apiKey 为空也算没拿到) → 用 init 拍的快照
  if (_chatModel) return _chatModel;
  // 实在没有 → fallback(env 没配 key 时是 fallback-missing-key,会 401)
  return _fallback(FALLBACK_CHAT_MODEL);
}

export function getEmbedModel() {
  if (_embedModel) return _embedModel;
  return _fallback.textEmbedding(FALLBACK_EMBED_MODEL);
}

// ============================================================
// 兼容旧 export(老代码引用 qwenChat / qwenEmbed 不动)
// ============================================================

/**
 * @deprecated 推荐用 getChatModel() — 这个 export 保留兼容
 * 启动顺序:如果先 import 这个,会先返回 fallback,首次请求时 initAiFromErpAdmin()
 * 应当已把 _chatModel 覆盖
 */
export const qwenChat = new Proxy({} as ReturnType<ReturnType<typeof createOpenAI>>, {
  get(_target, prop) {
    const m = getChatModel();
    return m[prop as keyof typeof m];
  },
});

/**
 * @deprecated 推荐用 getEmbedModel()
 */
export const qwenEmbed = new Proxy(
  {} as ReturnType<ReturnType<typeof createOpenAI>['textEmbedding']>,
  {
    get(_target, prop) {
      const m = getEmbedModel();
      return m[prop as keyof typeof m];
    },
  },
);

/**
 * @deprecated 读 peekCachedAiConfig()?.modelId 替代
 */
export const CHAT_MODEL = FALLBACK_CHAT_MODEL;
export const EMBED_MODEL = FALLBACK_EMBED_MODEL;

if (!isTest) {
  console.log(
    `[ai] module loaded (init from erp-admin deferred to first use or initAiFromErpAdmin())`,
  );
}

/**
 * 把一批文本转成向量
 * 百炼 Embedding API 限制:单次 batch ≤ 10
 * @param texts 文本数组
 * @returns 向量数组
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const BATCH_SIZE = 10;
  const allEmbeddings: number[][] = [];
  const model = getEmbedModel();
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { embeddings } = await embedMany({
      model,
      values: batch,
    });
    allEmbeddings.push(...embeddings);
  }
  return allEmbeddings;
}
