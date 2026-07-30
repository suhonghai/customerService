import { extractText, getDocumentProxy } from 'unpdf';

/**
 * PDF 解析工具(Day 5 FAQ 用)
 *
 * 用 unpdf(零依赖 + worker-free,Next.js / Node 都跑得动)
 *
 * 使用:
 *   const text = await parsePdf(buffer);
 */

/**
 * 把 .pdf buffer 解析为纯文本
 * - mergePages: true 把所有页合并成一个字符串,用 \n 分隔
 * - 返回 string(已 join)
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const uint8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(uint8);
  const { text } = await extractText(pdf, { mergePages: true });
  if (Array.isArray(text)) {
    return text.join('\n');
  }
  return String(text ?? '');
}