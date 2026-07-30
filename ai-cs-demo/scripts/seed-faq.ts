/**
 * Seed cs_faq 知识库(测试用)
 *
 * 跑法:tsx scripts/seed-faq.ts
 * 效果:读 data/faqs/*.md 全部入库(5 个文档,每个切 3-5 块)
 *
 * Day 9 重构:从文件系统读,不再硬编码。
 * 业务理由:FAQ 是真实知识库,内容应跟 .md 文件一一对应,改 .md 就能改知识。
 *
 * 注意:依赖 .env.local 的 DASHSCOPE_API_KEY(embed 用)
 *      重复跑会 clear + 重灌(幂等)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 同样手写一个 minimal .env.local loader —— tsx 跑 scripts 不自动加载
// ⚠️ 必须在动态 import rag 之前完成,否则 CHROMA_URL / DASHSCOPE_API_KEY 还没设置,
// ChromaStore 单例就走 in-memory 分支
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')
const ENV_LOCAL_PATH = resolve(PROJECT_ROOT, '.env.local')
const FAQ_DIR = resolve(PROJECT_ROOT, 'data/faqs')

function loadEnvLocal(path: string) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) {
      process.env[key] = val
    }
  }
}
loadEnvLocal(ENV_LOCAL_PATH)

// 加载 .env.local 之后,才能 import rag(它会读 CHROMA_URL 决定后端)
async function loadRag() {
  return await import('../src/lib/rag')
}

/** 加载 data/faqs/ 下所有 .md,返回 [{ name, content }] */
function loadFaqFiles(dir: string): { name: string; content: string }[] {
  if (!existsSync(dir)) {
    throw new Error(`FAQ directory not found: ${dir}`)
  }
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()  // 字母序,稳定输出
  if (files.length === 0) {
    throw new Error(`No .md files found in ${dir}`)
  }
  return files.map(name => {
    const content = readFileSync(join(dir, name), 'utf8')
    return { name, content }
  })
}

async function main() {
  const { addDocument, clearStore, getFaqInfo } = await loadRag()
  console.log(`[seed-faq] reading from ${FAQ_DIR} ...`)
  const docs = loadFaqFiles(FAQ_DIR)
  console.log(`[seed-faq] found ${docs.length} FAQ files:`)
  for (const d of docs) {
    const lines = d.content.split('\n').length
    console.log(`  - ${d.name} (${lines} lines, ${d.content.length} chars)`)
  }

  console.log('[seed-faq] starting seed...')

  // 测试前先清空,保证幂等
  console.log('[seed-faq] clearing store first...')
  try {
    await clearStore()
    console.log('[seed-faq] cleared')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`[seed-faq] clear warning: ${msg}`)
  }

  for (const doc of docs) {
    const count = await addDocument(doc.name, doc.content)
    console.log(`[seed-faq] added ${doc.name}: ${count} chunks`)
  }

  const info = await getFaqInfo()
  console.log(`[seed-faq] done. total: ${info.count} chunks, collection: ${info.collection}`)
}

main().catch(err => {
  console.error('[seed-faq] fatal:', err)
  process.exit(1)
})
