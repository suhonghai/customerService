import { NextResponse } from 'next/server';
import { getFaqInfo } from '@/lib/rag';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * GET /api/faq-info
 * 返回客服 FAQ 库的信息(W9-10 专用 — 跟 W7-8 的 /api/store-info 对齐)
 * 区别:聚焦 cs_faq collection + 持久化目录 + embedding 模型
 */
export async function GET() {
  try {
    const info = await getFaqInfo();
    return NextResponse.json({
      ...info,
      backend: env.CHROMA_URL ? 'Chroma(持久化)' : '内存(重启丢)',
      chromaUrl: env.CHROMA_URL || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || '查询失败' }, { status: 500 });
  }
}
