import { NextResponse } from 'next/server';
import { listDocuments, deleteDocument, clearStore, getStoreSize } from '@/lib/rag';

export const runtime = 'nodejs';

/**
 * GET /api/documents
 * 列出库里所有文档
 */
export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json({
      documents: docs,
      totalChunks: await getStoreSize(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/documents
 * Body: { source?: string, all?: boolean }
 * - 不传 source / 传 all: true → 清空整个库
 * - 传 source: 删除该文件的所有块
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { source, all } = body as { source?: string; all?: boolean };

    if (all || !source) {
      await clearStore();
      return NextResponse.json({ ok: true, action: 'cleared-all' });
    }

    const removed = await deleteDocument(source);
    return NextResponse.json({
      ok: true,
      action: 'deleted',
      source,
      removedChunks: removed,
      totalChunks: await getStoreSize(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
