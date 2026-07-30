import { NextRequest, NextResponse } from 'next/server';
import { addDocument, getFaqInfo } from '@/lib/rag';
import { parseFile, isSupportedFile } from '@/lib/parser';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 文件大小上限(50MB)——超过会让解析超时/内存爆
// 推荐策略:大文档按章节拆分成多个小文件上传
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
// 软警告阈值(20MB)——超过这个提示用户可能慢
const WARN_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * 文件名安全校验(防路径穿越 — 沿用 W7-8 MCP 写法)
 * 拒绝包含 `..` / `/` / `\` / 空字节 / 过长 / 非法的字符
 * 这条文件会作为 Chroma metadata.source 存储,虽不直接拼路径,
 * 但防止 XSS / 日志污染 / 后续被用来当文件名的场景
 */
function isPathSafe(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (name.length > 255) return false;
  if (name.includes('..')) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (/[\x00-\x1f]/.test(name)) return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '没传文件' }, { status: 400 });
    }

    if (!isSupportedFile(file.name)) {
      return NextResponse.json(
        { error: `不支持的文件类型,目前支持 .txt / .md / .pdf` },
        { status: 400 },
      );
    }

    if (!isPathSafe(file.name)) {
      return NextResponse.json(
        { error: `文件名不合法: ${file.name}(含路径分隔符或非法字符)` },
        { status: 400 },
      );
    }

    // 文件大小校验
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        {
          error: `文件太大(${sizeMB}MB),超过 50MB 限制`,
          hint: '请把大 FAQ 按主题拆分成多个 ≤50MB 的小文件再上传',
        },
        { status: 413 }, // 413 Payload Too Large
      );
    }

    const isLarge = file.size > WARN_FILE_SIZE;

    // File → ArrayBuffer → Buffer(Node)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { text, pages } = await parseFile(buffer, file.name);

    if (text.trim().length === 0) {
      return NextResponse.json(
        {
          error: '文件内容是空的',
          hint: '如果是 PDF,可能是扫描版(图片内容,没有文字层)。扫描版需要先用 OCR 工具转成可复制的文字 PDF 才能入库。',
        },
        { status: 400 },
      );
    }

    const count = await addDocument(file.name, text);
    const info = await getFaqInfo();

    return NextResponse.json({
      ok: true,
      filename: file.name,
      chunks: count,
      pages, // PDF 时显示页数
      totalChunks: info.count,
      collection: info.collection,
      warning: isLarge ? '文件较大,处理可能较慢。建议拆分成小主题上传,检索更精准。' : undefined,
    });
  } catch (err) {
    console.error('[upload-faq] error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg || '上传失败' }, { status: 500 });
  }
}
