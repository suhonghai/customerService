import { ChromaClient, type Collection } from 'chromadb';
import { embedTexts } from './ai';
import { env, isProd } from './env';

/**
 * 一个文档块(业务层不关心后端,只看 Chunk)
 */
export interface Chunk {
  id: string;
  text: string;
  embedding: number[];
  source: string; // 来源文件名
  index: number; // 第几块
}

/**
 * 检索结果(带相似度分数)
 */
export interface SearchResult {
  chunk: Chunk;
  score: number;
}

/**
 * 向量库抽象接口 —— 业务代码只依赖这个
 * 换 pgvector / Pinecone 只用新加一个实现类
 */
interface VectorStore {
  add(chunks: Chunk[]): Promise<void>;
  search(queryEmbedding: number[], topK: number): Promise<SearchResult[]>;
  size(): Promise<number>;
  clear(): Promise<void>;
  listDocuments(): Promise<{ source: string; chunks: number }[]>;
  deleteDocument(source: string): Promise<number>;
}

/**
 * 文档摘要(给 UI 用)
 */
export interface DocumentInfo {
  source: string;
  chunks: number;
}

// ============= 内存实现(默认,demo 用) =============

class InMemoryStore implements VectorStore {
  private store: Chunk[] = [];

  async add(chunks: Chunk[]): Promise<void> {
    this.store.push(...chunks);
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    if (this.store.length === 0) return [];

    const scored = this.store.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async size(): Promise<number> {
    return this.store.length;
  }

  async clear(): Promise<void> {
    this.store.length = 0;
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    const map = new Map<string, number>();
    for (const c of this.store) {
      map.set(c.source, (map.get(c.source) || 0) + 1);
    }
    return Array.from(map.entries()).map(([source, chunks]) => ({ source, chunks }));
  }

  async deleteDocument(source: string): Promise<number> {
    const before = this.store.length;
    this.store = this.store.filter((c) => c.source !== source);
    return before - this.store.length;
  }
}

// ============= Chroma 实现(持久化,生产用) =============

// W5-6:读 .env.local 的 CHROMA_COLLECTION(默认 agent-docs),跟 W3-4 的 rag-docs 完全隔离
const CHROMA_COLLECTION = env.CHROMA_COLLECTION || 'agent-docs';

class ChromaStore implements VectorStore {
  private client: ChromaClient;
  private collectionName = CHROMA_COLLECTION;
  // collection 缓存,避免每次操作都重新 get
  private collectionPromise: Promise<Collection> | null = null;

  constructor(url: string) {
    // 新版 API:用 host/port/ssl 代替 path(避免 deprecation 警告)
    const u = new URL(url);
    this.client = new ChromaClient({
      host: u.hostname,
      port: Number(u.port) || 8000,
      ssl: u.protocol === 'https:',
    });
  }

  private async getCollection() {
    if (!this.collectionPromise) {
      this.collectionPromise = (async () => {
        // getOrCreateCollection:有就拿,没有就建
        return await this.client.getOrCreateCollection({
          name: this.collectionName,
          // null = 不使用任何 embedding function(我们自己 embed,用百炼)
          embeddingFunction: null,
        });
      })();
    }
    return this.collectionPromise;
  }

  async add(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const collection = await this.getCollection();

    await collection.add({
      ids: chunks.map((c) => c.id),
      embeddings: chunks.map((c) => c.embedding),
      documents: chunks.map((c) => c.text),
      metadatas: chunks.map((c) => ({ source: c.source, index: c.index })),
    });
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const collection = await this.getCollection();
    const count = await collection.count();
    if (count === 0) return [];

    const result = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: Math.min(topK, count),
    });

    // Chroma 返回的是平铺数组(虽然只查 1 个 query,shape 仍然是二维)
    const ids = result.ids[0] || [];
    const docs = result.documents[0] || [];
    const embs = result.embeddings?.[0] || [];
    const metas = result.metadatas?.[0] || [];
    // Chroma 默认用 L2 距离(越小越相似),要转成"越大越相似"的形式
    const distances = result.distances?.[0] || [];

    return ids.map((id: string, i: number) => ({
      chunk: {
        id,
        text: docs[i] || '',
        embedding: embs[i] || [],
        // Chroma metadata value 类型很宽(string | number | string[] | SparseVector | ...),
        // SearchResult.source 要求 string,这里统一走 String() 兜底
        source: String(metas[i]?.source ?? 'unknown'),
        // Chroma metadata value 同 source 是宽类型;SearchResult.index 要求 number
        index: Number(metas[i]?.index ?? i),
      },
      // L2 距离 → 相似度(简单反归一化:1 / (1 + d))
      score: 1 / (1 + (distances[i] ?? 0)),
    }));
  }

  async size(): Promise<number> {
    const collection = await this.getCollection();
    return await collection.count();
  }

  async clear(): Promise<void> {
    await this.client.deleteCollection({ name: this.collectionName });
    this.collectionPromise = null; // 下次 add 时重建
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    const collection = await this.getCollection();
    const count = await collection.count();
    if (count === 0) return [];

    // 拉所有 metadata,然后在内存里聚合
    // Chroma get 一次能拉多少?有 limit,先尝试全拉,失败再分页
    const all = await collection.get({ include: ['metadatas'] });
    const metas = all.metadatas || [];
    const map = new Map<string, number>();
    for (const m of metas) {
      const source = m?.source;
      if (typeof source === 'string') {
        map.set(source, (map.get(source) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([source, chunks]) => ({ source, chunks }))
      .sort((a, b) => a.source.localeCompare(b.source));
  }

  async deleteDocument(source: string): Promise<number> {
    const collection = await this.getCollection();
    // 先查这个 source 有多少块(删前数)
    const before = await collection.count();
    await collection.delete({ where: { source } });
    const after = await collection.count();
    return before - after;
  }
}

// ============= 后端选择 =============

function createStore(): VectorStore {
  const url = env.CHROMA_URL;
  if (url) {
    console.log(`[rag] Using Chroma at ${url}`);
    return new ChromaStore(url);
  }
  console.log('[rag] Using in-memory store (data lost on restart)');
  return new InMemoryStore();
}

// 单例 —— Next.js dev 时模块会被多次求值,用 globalThis 缓存
declare global {
  var __ragStore: VectorStore | undefined;
}
const store: VectorStore = globalThis.__ragStore ?? createStore();
if (!isProd) {
  globalThis.__ragStore = store;
}

// ============= 工具函数(切片 + 余弦相似度) =============

/**
 * 按字数切片(500 字一块,100 字重叠,生产标配)
 */
export function splitText(text: string, chunkSize = 500, overlap = 100): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (cleaned.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start += chunkSize - overlap;
    if (start >= cleaned.length) break;
  }

  return chunks;
}

/**
 * 余弦相似度(给内存 store 用,Chroma 走自己的距离算法)
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

// ============= 业务层 API(跟旧版本完全一样,业务代码不用改) =============

/**
 * 把文档加进库:切片 → embedding → 存
 */
export async function addDocument(filename: string, content: string): Promise<number> {
  const texts = splitText(content);
  if (texts.length === 0) return 0;

  const embeddings = await embedTexts(texts);

  const chunks: Chunk[] = texts.map((text, i) => ({
    id: `${filename}-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    embedding: embeddings[i],
    source: filename,
    index: i,
  }));

  await store.add(chunks);
  return chunks.length;
}

/**
 * 检索 Top K 个最相关的块
 */
export async function search(query: string, topK = 3): Promise<SearchResult[]> {
  const [queryEmbedding] = await embedTexts([query]);
  const results = await store.search(queryEmbedding, topK);
  return results.filter((r) => r.score >= 0.3);
}

/**
 * 看库里有多少块
 */
export async function getStoreSize(): Promise<number> {
  return await store.size();
}

/**
 * 清空库
 */
export async function clearStore(): Promise<void> {
  await store.clear();
}

/**
 * 列出库里所有文档(去重 + 统计每文件块数)
 */
export async function listDocuments(): Promise<DocumentInfo[]> {
  return await store.listDocuments();
}

/**
 * 按文件名删除一个文档的所有块
 * @returns 删除了多少个块
 */
export async function deleteDocument(source: string): Promise<number> {
  return await store.deleteDocument(source);
}

/**
 * 客服 FAQ 库信息(W9-10 专用,给 /api/faq-info 用)
 * 返回 collection 名、块数、持久化目录、embedding 模型 — 跟 W7-8 的 store-info 对齐,
 * 区别:聚焦 cs_faq collection + 持久化目录
 */
export interface FaqInfo {
  count: number;
  collection: string;
  persistDir: string;
  model: string;
}

export async function getFaqInfo(): Promise<FaqInfo> {
  const count = await store.size();
  return {
    count,
    collection: CHROMA_COLLECTION,
    persistDir: env.CHROMA_PERSIST_DIR || './chroma-data-cs',
    model: env.EMBED_MODEL || 'text-embedding-v4',
  };
}
