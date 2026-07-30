import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { FileAuthGuard } from '../../common/guards/file-auth.guard';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';

@ApiTags('文件下载')
@Controller('files')
export class FileController {
  private readonly logger = new Logger(FileController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('UPLOAD_DIR') private readonly uploadDir: string,
  ) {}

  /**
   * GET /api/files/* — 下载文件
   *
   * 路径:相对 uploadDir 的 storagePath(由 file_meta.storagePath 给出)
   * 鉴权:FileAuthGuard(支持 jwt + internal token)
   */
  @Get('*')
  @UseGuards(FileAuthGuard)
  @ApiOperation({ summary: '按 storagePath 下载文件(鉴权)' })
  async download(
    @Param() params: Record<string, string>,
    @Req() _req: Request,
    @Res() res: Response,
  ) {
    // Express 把 *path 的捕获值放在 params['0'] 上面
    const storagePath = params['0'] ?? '';
    if (!storagePath) {
      throw new BizException(BizCode.PARAM_ERROR, '文件路径不能为空');
    }
    const meta = await this.prisma.fileMeta.findFirst({
      where: { storagePath, deletedAt: null },
    });
    if (!meta) {
      throw new BizException(BizCode.FAQ_NOT_FOUND, '文件不存在');
    }
    const fullPath = join(this.uploadDir, storagePath);
    if (!existsSync(fullPath)) {
      this.logger.warn(`file on disk missing: ${fullPath}`);
      throw new BizException(BizCode.FAQ_NOT_FOUND, '文件已丢失');
    }

    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`,
    );
    res.setHeader('Content-Length', String(meta.fileSize));
    const stream = createReadStream(fullPath);
    stream.pipe(res);
  }
}
