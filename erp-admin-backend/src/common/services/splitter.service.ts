import { Injectable } from '@nestjs/common';

/**
 * 文本切片(Day 5 FAQ 用,沿用 W3-4 算法)
 *
 * 策略:
 * - 500 字一块,100 字重叠
 * - .md 按 `\n\n`(段落边界)切优先,再按窗口滑
 * - .txt 按 `\n` 单换行切
 * - .pdf 由调用方先 parse 出纯文本,这里不区分
 *
 * 为什么 500 字 + 100 重叠:
 * - 阿里云 text-embedding-v4 上限 2048 token,500 中文字符 ~ 1000 token,安全
 * - 100 字重叠保证段落边界语义不丢
 */

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 100;

@Injectable()
export class SplitterService {
  /**
   * 主入口
   * @param text 全文
   * @returns 切片数组(每个不超过 500 字)
   */
  split(text: string): string[] {
    if (!text || !text.trim()) return [];
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return this.recursiveSplit(normalized);
  }

  /**
   * 优先按段落切(双换行),再按窗口滑
   */
  private recursiveSplit(text: string): string[] {
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
    const result: string[] = [];

    for (const para of paragraphs) {
      const cleaned = para.trim();
      if (cleaned.length <= CHUNK_SIZE) {
        result.push(cleaned);
      } else {
        // 大段落:按窗口切
        result.push(...this.windowSplit(cleaned));
      }
    }

    // 合并过短切片 + 加重叠
    return this.mergeWithOverlap(result);
  }

  /**
   * 固定窗口滑动(每 CHUNK_SIZE 取一块,带 CHUNK_OVERLAP 重叠)
   */
  private windowSplit(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + CHUNK_SIZE, text.length);
      chunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
  }

  /**
   * 把过短的相邻块合并,顺便加段间重叠(让检索召回更稳)
   */
  private mergeWithOverlap(blocks: string[]): string[] {
    if (blocks.length <= 1) return blocks;

    const out: string[] = [];
    let buf = '';
    for (const b of blocks) {
      if (!buf) {
        buf = b;
        continue;
      }
      // 若 buf + b 不超 CHUNK_SIZE,合并
      if ((buf + '\n\n' + b).length <= CHUNK_SIZE) {
        buf = buf + '\n\n' + b;
      } else {
        out.push(buf);
        // 新块带上旧块尾 CHUNK_OVERLAP 作为重叠
        const tail = buf.slice(-CHUNK_OVERLAP);
        buf = tail ? tail + '\n\n' + b : b;
      }
    }
    if (buf) out.push(buf);
    return out;
  }
}