import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ChromaClient, Collection } from 'chromadb';

/**
 * FaqChromaService(Day 5)
 *
 * - chromadb 3.x 默认走 v2 API,服务端已启用
 * - embeddingFunction: null → 用百炼 SDK 自行 embed
 * - cosine 距离(metadata hnsw:space)
 * - metadata: docId / version / status / title / category / chunkIndex
 *
 * 方法:
 * - addChunks:写入指定 docId+version 的所有 chunk(发布时)
 * - deleteByDocVersion:删指定 docId+version 的所有 chunk(下线时)
 * - deleteByDoc:删整个文档的所有 chunk(软删文档时)
 * - search:语义检索(Day 18 ai-cs-demo 用)
 */

@Injectable()
export class FaqChromaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FaqChromaService.name);
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private collectionName = 'erp_faq';

  async onModuleInit() {
    const url = process.env.CHROMA_URL || 'http://127.0.0.1:8001';
    this.collectionName = process.env.CHROMA_COLLECTION || 'erp_faq';
    // chromadb 3.x: `path` deprecated,改用 host/port/ssl
    // URL 形如 http://127.0.0.1:8001 → { host, port, ssl }
    const u = new URL(url);
    this.client = new ChromaClient({
      host: u.hostname,
      port: u.port ? Number(u.port) : 8000,
      ssl: u.protocol === 'https:',
    });
    try {
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        embeddingFunction: null,
        metadata: { 'hnsw:space': 'cosine' },
      });
      this.logger.log(
        `✅ Chroma ready: ${url} collection=${this.collectionName}`,
      );
    } catch (e) {
      this.logger.error(
        `❌ Chroma init failed: ${(e as Error).message} — FAQ 写入会失败`,
      );
      // 不抛:服务可起,FAQ 写入时再 fail-fast
    }
  }

  async onModuleDestroy() {
    // chromadb 客户端无显式 close,GC 即可
  }

  private ensureCollection(): Collection {
    if (!this.collection) {
      throw new Error('Chroma collection not initialized');
    }
    return this.collection;
  }

  /**
   * 发布时:写入 docId+version 的所有 chunk
   * - ids:faq-{docId}-v{version}-{i}
   * - documents:切片文本
   * - embeddings:百炼算好的向量
   * - metadatas:{docId, version, status:'published', title, category, chunkIndex}
   */
  async addChunks(
    docId: number,
    version: number,
    title: string,
    category: string,
    chunks: string[],
    embeddings: number[][],
  ): Promise<void> {
    if (!chunks || chunks.length === 0) return;
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `chunks.length (${chunks.length}) != embeddings.length (${embeddings.length})`,
      );
    }
    const col = this.ensureCollection();
    const ids = chunks.map((_, i) => `faq-${docId}-v${version}-${i}`);
    const metadatas = chunks.map((_, i) => ({
      docId,
      version,
      status: 'published',
      title,
      category,
      chunkIndex: i,
    }));
    await col.add({ ids, documents: chunks, embeddings, metadatas });
    this.logger.log(
      `Chroma addChunks: docId=${docId} v=${version} chunks=${chunks.length}`,
    );
  }

  /**
   * 下线指定版本:删 docId+version 的所有 chunk
   * chromadb 3.x where 只支持单字段,用 $and 组合
   */
  async deleteByDocVersion(docId: number, version: number): Promise<void> {
    const col = this.ensureCollection();
    try {
      await col.delete({
        where: {
          $and: [{ docId }, { version }],
        },
      });
      this.logger.log(
        `Chroma deleteByDocVersion: docId=${docId} v=${version}`,
      );
    } catch (e) {
      // 空 where 删 chromadb 可能报;无所谓,已删干净
      this.logger.warn(
        `Chroma deleteByDocVersion noop or error: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 软删整个文档:删 docId 下所有版本
   */
  async deleteByDoc(docId: number): Promise<void> {
    const col = this.ensureCollection();
    try {
      await col.delete({ where: { docId } });
      this.logger.log(`Chroma deleteByDoc: docId=${docId}`);
    } catch (e) {
      this.logger.warn(
        `Chroma deleteByDoc noop or error: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 语义检索(给 Day 18 ai-cs-demo 用,Day 5 不直接调)
   * - 只返 status=published 的 chunk
   */
  async search(
    queryEmbedding: number[],
    topK = 3,
  ): Promise<
    Array<{
      content: string;
      metadata: Record<string, unknown> | null;
      distance: number | null;
    }>
  > {
    const col = this.ensureCollection();
    const result = await col.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: { status: 'published' },
    });
    const docs = result.documents?.[0] ?? [];
    const metas = result.metadatas?.[0] ?? [];
    const dists = result.distances?.[0] ?? [];
    return docs.map((doc, i) => ({
      content: doc ?? '',
      metadata: (metas[i] as Record<string, unknown>) ?? null,
      distance: dists[i] ?? null,
    }));
  }

  /**
   * 取 collection 中所有 chunk 数(测试 / 调试用)
   */
  async count(): Promise<number> {
    const col = this.ensureCollection();
    return col.count();
  }
}