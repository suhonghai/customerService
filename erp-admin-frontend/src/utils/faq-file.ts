/**
 * FAQ 上传文件工具
 *
 * 业务规则(对齐后端 faq.service.ts 的后缀白名单):
 *   - 允许:.md / .txt / .pdf
 *   - 单文件:maxCount = 1
 *   - 后端再做 content-type 校验,前端只负责「友好提示」
 */

export const FAQ_ALLOWED_EXTENSIONS = ['.md', '.txt', '.pdf'] as const;
export type FAQAllowedExtension = (typeof FAQ_ALLOWED_EXTENSIONS)[number];

/**
 * 从文件名 / URI 里取小写后缀(含点)。
 * @example
 *   getFileExt('FAQ.md') // '.md'
 *   getFileExt('foo.PDF') // '.pdf'
 *   getFileExt('noext')  // ''
 */
export function getFileExt(name: string | null | undefined): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i).toLowerCase();
}

/**
 * 判断文件名后缀是否在 FAQ 允许的白名单里。
 */
export function isFAQAllowedFile(name: string | null | undefined): boolean {
  const ext = getFileExt(name);
  return (FAQ_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * 同步读文件 → SHA-256 hex。浏览器侧拿到后传给后端做去重。
 * File API 在 jsdom 下不支持,测试可 mock crypto.subtle / readAsArrayBuffer。
 */
export async function sha256OfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * 把 tags 字符串拆成数组(逗号分隔,trim,过滤空)。
 * @example
 *   parseTagString('退款,发票 , 物流') // ['退款','发票','物流']
 */
export function parseTagString(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
