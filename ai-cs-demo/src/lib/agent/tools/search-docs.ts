import { z } from 'zod';
import { defineTool } from './define-tool';
import { search, type SearchResult } from '../../rag';
// embedTexts 当前未在此工具使用 — 原 import 已删除(W11 清理);后续如需批量向量可重新引入。

/**
 * search_docs - 调 W3-4 的 vectorstore 检索,作为 Agent 工具
 *
 * 设计要点:
 * 1. topK 让 AI 决策(默认 3,1-10)— 体现手册 §4.6 "maxSteps 多步推理"
 * 2. 返回带 score,前端可做阈值过滤
 * 3. 失败时定义错误 → defineTool catch 后返回 { error: true, message } 让 Agent 看到失败原因
 * 4. 接 AbortSignal:用户 stop 后 Chroma / 百炼 Embedding 请求都立即中断
 */
export const searchDocs = defineTool({
  description:
    '在用户上传的 PDF / TXT / MD 知识库里检索相关文档块。' +
    '当用户问"我之前收藏的资料"、"PDF 里说..."、"根据上传的文档"时调用。' +
    '返回前 N 个最相关的文本块,带相似度分数(0-1,越高越相关)。',
  inputSchema: z.object({
    query: z.string().describe('检索关键词或问题,跟用户原话相关即可'),
    topK: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('返回几条结果。简单问题 3,复杂问题 5-8。默认 3。'),
  }),
  execute: async ({ query, topK = 3 }, ctx) => {
    // 检索开始前早退(用户在打字时 cancel 就能省一次 embedding 请求)
    if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const raw: SearchResult[] = await search(query, topK);
    // 检索结束后再早退(LLM 已被 stop,但检索请求已经发出去了,扔掉结果不返回给 Agent)
    if (ctx.signal.aborted) throw new DOMException('aborted', 'AbortError');
    const results = raw.map((r) => ({
      source: r.chunk.source,
      index: r.chunk.index,
      score: Math.round(r.score * 1000) / 1000,
      text: r.chunk.text.slice(0, 500),
    }));
    return { query, topK, count: results.length, results };
  },
});
