/**
 * scripts/seed-faq-chroma.ts(Day 5)
 *
 * 把 seed 时已 status=2 的 FAQ 文档:
 * 1. 把 data/seed-faqs/*.md 物理复制到 UPLOAD_DIR(seed 占位路径)
 * 2. 切片(500+100)
 * 3. embed(百炼 text-embedding-v4,优先从 erp-admin active ai-config 拿明文 apiKey)
 * 4. 写入 Chroma collection erp_faq
 * 5. 回写 faq_version.chunkCount
 *
 * 用法:
 *   pnpm tsx scripts/seed-faq-chroma.ts
 *
 * Key 来源(W11 2026-07-13 改进):
 *  1) 优先:从 erp-admin /api/internal/cs/ai-config/active 拿明文 key
 *     (用户已在后台 ai_config 配过,统一从这里走,避免 .env 重复配置)
 *  2) 兜底:从 env DASHSCOPE_API_KEY(老方式)
 *
 * 注意:
 *  - 启动前 Chroma + erp-admin backend 必须已启
 *  - 优先用 ERP_ADMIN_URL(默认 http://127.0.0.1:3001)
 *  - 需 INTERNAL_TOKEN(同 backend .env 里的值)
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.development'), override: false });

const CHROMA_URL = process.env.CHROMA_URL || 'http://127.0.0.1:8001';
const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || 'erp_faq';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/erp-admin-uploads';
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-v4';
const ERP_ADMIN_URL = process.env.ERP_ADMIN_URL || 'http://127.0.0.1:3001';
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || 'local-internal-token-32chars-min-xxxxx-please-rotate';
const EMBED_BATCH = 10;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

const prisma = new PrismaClient();

/** 简单 splitter(沿用 W3-4 算法) */
function splitText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim());
  const result: string[] = [];
  for (const para of paragraphs) {
    const cleaned = para.trim();
    if (cleaned.length <= CHUNK_SIZE) {
      result.push(cleaned);
    } else {
      let start = 0;
      while (start < cleaned.length) {
        const end = Math.min(start + CHUNK_SIZE, cleaned.length);
        result.push(cleaned.slice(start, end));
        if (end >= cleaned.length) break;
        start += CHUNK_SIZE - CHUNK_OVERLAP;
      }
    }
  }
  return result;
}

/** 从 erp-admin 拉 active AI config(明文 apiKey + baseUrl) */
async function fetchActiveAiConfig(): Promise<{ apiKey: string; baseUrl: string; modelId: string } | null> {
  try {
    const url = `${ERP_ADMIN_URL}/api/internal/cs/ai-config/active`
    const resp = await fetch(url, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    })
    if (!resp.ok) {
      console.warn(`⚠️  erp-admin active ai-config 返 ${resp.status},降级用 env DASHSCOPE_API_KEY`)
      return null
    }
    const json: any = await resp.json()
    if (json.code !== 0 || !json.data?.apiKey) {
      console.warn(`⚠️  erp-admin active ai-config 业务错 code=${json.code},降级`)
      return null
    }
    console.log(`✅ 从 erp-admin 拉到 active ai-config: ${json.data.code} (model=${json.data.modelId})`)
    return {
      apiKey: json.data.apiKey,
      baseUrl: json.data.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelId: json.data.modelId,
    }
  } catch (e) {
    console.warn(`⚠️  erp-admin 不可达(${(e as Error).message}),降级用 env DASHSCOPE_API_KEY`)
    return null
  }
}

async function main() {
  console.log('🌱 seed-faq-chroma 开始 ...');
  console.log(`   CHROMA_URL=${CHROMA_URL} collection=${CHROMA_COLLECTION}`);
  console.log(`   UPLOAD_DIR=${UPLOAD_DIR} EMBED_MODEL=${EMBED_MODEL}`);
  console.log(`   ERP_ADMIN_URL=${ERP_ADMIN_URL}`);

  // 1. 拿 API key(优先 erp-admin active config,降级 env)
  const aiConfig = await fetchActiveAiConfig()
  const apiKey = aiConfig?.apiKey || process.env.DASHSCOPE_API_KEY
  const baseUrl = aiConfig?.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY 未配置,且 erp-admin 不可达或无 active config')
  }

  // 2. Chroma client
  const chroma = new ChromaClient({ path: CHROMA_URL });
  const collection = await chroma.getOrCreateCollection({
    name: CHROMA_COLLECTION,
    embeddingFunction: null,
    metadata: { 'hnsw:space': 'cosine' },
  });
  console.log(`✅ Chroma collection ready: ${CHROMA_COLLECTION}`);

  // 3. Embedding client
  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl,
  });

  // 3. 取所有 status=2 且 chunkCount=0 的 FAQ 版本(待 Chroma 入库)
  const versions = await prisma.faqVersion.findMany({
    where: { status: 2, chunkCount: 0 },
    include: { document: true },
  });
  console.log(`📋 待 Chroma 入库的版本: ${versions.length}`);

  if (versions.length === 0) {
    console.log('✅ 无需处理,所有 status=2 的版本 chunkCount>0');
    return;
  }

  const seedFaqDir = path.join(__dirname, '..', 'data', 'seed-faqs');

  for (const v of versions) {
    // 文件路径:seed 时占位为 "seed-faqs/xxx.md",真实文件在 data/seed-faqs/
    const seedFile = path.basename(v.filePath);
    const sourcePath = path.join(seedFaqDir, seedFile);

    if (!fs.existsSync(sourcePath)) {
      console.warn(`⚠️  source 文件不存在: ${sourcePath}, 跳过 v=${v.version}`);
      continue;
    }

    // 物理复制到 UPLOAD_DIR(seed-faqs/xxx.md)
    const targetRel = v.filePath;
    const targetFull = path.join(UPLOAD_DIR, targetRel);
    fs.mkdirSync(path.dirname(targetFull), { recursive: true });
    fs.copyFileSync(sourcePath, targetFull);
    console.log(`📁 复制: ${sourcePath} -> ${targetFull}`);

    // 切片
    const text = fs.readFileSync(sourcePath, 'utf-8');
    const chunks = splitText(text);
    console.log(`✂️  docId=${v.documentId} v=${v.version} chunks=${chunks.length}`);

    if (chunks.length === 0) {
      await prisma.faqVersion.update({
        where: { id: v.id },
        data: { chunkCount: 0 },
      });
      continue;
    }

    // embed(批量 10)
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const resp = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: batch,
        encoding_format: 'float',
      });
      for (const item of resp.data) allEmbeddings.push(item.embedding);
    }
    console.log(`🧠 embedded: ${allEmbeddings.length} vectors`);

    // 写 Chroma
    const ids = chunks.map((_, i) => `faq-${v.documentId}-v${v.version}-${i}`);
    const metadatas = chunks.map((_, i) => ({
      docId: v.documentId,
      version: v.version,
      status: 'published',
      title: v.document.title,
      category: v.document.category ?? '',
      chunkIndex: i,
    }));
    await collection.add({
      ids,
      documents: chunks,
      embeddings: allEmbeddings,
      metadatas,
    });
    console.log(`✅ Chroma added: docId=${v.documentId} v=${v.version}`);

    // 回写 chunkCount
    await prisma.faqVersion.update({
      where: { id: v.id },
      data: { chunkCount: chunks.length },
    });
  }

  const count = await collection.count();
  console.log(`📊 Chroma collection total count: ${count}`);
  console.log('🎉 seed-faq-chroma 完成');
}

main()
  .catch((e) => {
    console.error('❌ 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });