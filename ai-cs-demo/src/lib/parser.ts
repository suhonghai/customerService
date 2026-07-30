import { extractText, extractTextItems } from 'unpdf'

/**
 * 把上传的文件转成纯文本
 * 支持 .txt / .md / .pdf
 * @param buffer 文件二进制
 * @param filename 文件名(用于判断类型)
 */
export async function parseFile(buffer: Buffer, filename: string): Promise<{
  text: string
  pages?: number
}> {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))

  if (ext === '.pdf') {
    // unpdf 在 serverless / Next.js 环境下能直接跑(自带 PDF.js,不依赖 worker 文件)
    // 策略:先用标准 extractText,提取不出来就退到 extractTextItems(结构化数据,能拿部分自定义字体)
    const data = new Uint8Array(buffer)

    let text = ''
    let totalPages = 0

    try {
      const result = await extractText(data, { mergePages: true })
      text = result.text
      totalPages = result.totalPages
    } catch (err) {
      console.warn('[parser] extractText failed, fallback to extractTextItems:', err)
    }

    // 如果标准提取没拿到字,试结构化提取(可能能拿到部分自定义字体)
    if (!text || text.trim().length === 0) {
      try {
        const items = await extractTextItems(data)
        totalPages = items.totalPages
        text = items.items
          .map(page => page.map(it => it.text || '').join(' '))
          .join('\n\n')
        console.log(`[parser] fallback extracted ${text.length} chars`)
      } catch (err) {
        console.warn('[parser] extractTextItems also failed:', err)
      }
    }

    return { text, pages: totalPages }
  }

  // .txt / .md:直接当 UTF-8 文本
  if (ext === '.txt' || ext === '.md') {
    return { text: buffer.toString('utf-8') }
  }

  throw new Error(`不支持的文件类型: ${ext}(目前支持 .txt / .md / .pdf)`)
}

/**
 * 看后缀是否在支持列表
 */
export function isSupportedFile(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'))
  return ['.txt', '.md', '.pdf'].includes(ext)
}
