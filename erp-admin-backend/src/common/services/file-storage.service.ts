import { Injectable, Inject, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * 文件存储 Provider 抽象接口(Day 5)
 *
 * 设计:把"怎么存"和"怎么用"解耦,后续可切 COS / OSS / S3,
 * 只需新增一个实现 FileStorageProvider 的 class,module 替换 useClass 即可。
 *
 * 方法语义:
 * - save:落盘 + 返相对路径(相对 uploadDir)
 * - read:读 buffer
 * - delete:删文件
 * - exists:是否在
 * - getUrl:返可被前端访问的 URL 路径
 */
export interface FileStorageProvider {
  /** 存文件,返相对路径(相对 uploadDir) */
  save(buffer: Buffer, filename: string, subdir: string): Promise<string>;
  /** 读 buffer(失败抛) */
  read(relativePath: string): Promise<Buffer>;
  /** 删(不存在不报错) */
  delete(relativePath: string): Promise<void>;
  /** 是否存在 */
  exists(relativePath: string): Promise<boolean>;
  /** 返可访问 URL(相对路径 + 前缀;后续切 COS 可改绝对 URL) */
  getUrl(relativePath: string): string;
}

/**
 * 本地磁盘实现(Day 5 默认)
 *
 * 目录结构:{uploadDir}/{subdir}/{YYYY}/{MM}/{uuid}{ext}
 * - 例子:/tmp/erp-admin-uploads/faq/2026/06/abc-uuid.md
 * - 月份分目录防止单目录文件过多
 * - uuid 防覆盖
 *
 * URL:返 /api/files/{encoded relativePath}(后续 Day 9 可挂 controller 提供下载)
 */
@Injectable()
export class LocalFileStorage implements FileStorageProvider {
  private readonly logger = new Logger(LocalFileStorage.name);

  constructor(@Inject('UPLOAD_DIR') private readonly uploadDir: string) {
    // 确保 uploadDir 存在
    try {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    } catch (e) {
      this.logger.warn(`mkdir uploadDir ${this.uploadDir} failed: ${(e as Error).message}`);
    }
  }

  async save(buffer: Buffer, filename: string, subdir: string): Promise<string> {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dir = path.join(this.uploadDir, subdir, year, month);
    await fs.promises.mkdir(dir, { recursive: true });

    const ext = path.extname(filename) || '';
    const uniqueName = `${uuidv4()}${ext}`;
    const fullPath = path.join(dir, uniqueName);
    await fs.promises.writeFile(fullPath, buffer);

    const relative = path.relative(this.uploadDir, fullPath);
    this.logger.log(
      `file saved: subdir=${subdir} name=${filename} -> ${relative} (${buffer.length}B)`,
    );
    return relative;
  }

  async read(relativePath: string): Promise<Buffer> {
    const full = path.join(this.uploadDir, relativePath);
    return fs.promises.readFile(full);
  }

  async delete(relativePath: string): Promise<void> {
    const full = path.join(this.uploadDir, relativePath);
    try {
      await fs.promises.unlink(full);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw err;
      // 不存在视为已删
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.promises.access(path.join(this.uploadDir, relativePath), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(relativePath: string): string {
    // 简单用 encodeURIComponent,后续 Day 9 可挂 controller 提供下载/鉴权
    return `/api/files/${encodeURIComponent(relativePath)}`;
  }
}
