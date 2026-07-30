import { NextResponse } from 'next/server';
import { getStoreSize } from '@/lib/rag';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET() {
  const backend = env.CHROMA_URL ? 'Chroma(持久化)' : '内存(重启丢)';
  try {
    const size = await getStoreSize();
    return NextResponse.json({
      size,
      backend,
      chromaUrl: env.CHROMA_URL || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || '查询失败', backend }, { status: 500 });
  }
}
