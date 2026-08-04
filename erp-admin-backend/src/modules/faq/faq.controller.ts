import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { CurrentUser, ICurrentUser } from '../../common/decorators/user.decorator';
import { FaqService } from './faq.service';
import { FaqChromaService } from './faq-chroma.service';
import { UploadFaqDto } from './dto/upload-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { QueryFaqDto } from './dto/query-faq.dto';
import { ReviewFaqDto } from './dto/review-faq.dto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXT = new Set(['.md', '.txt', '.pdf']);

/**
 * multer fileFilter — 拒绝非允许类型
 * 用 NestJS 标准的 FileInterceptor('file', opts)
 */
function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(
      new BizException(BizCode.PARAM_MISSING, `不支持的文件类型:${ext},仅允许 .md / .txt / .pdf`),
      false,
    );
  }
  cb(null, true);
}

@ApiTags('FAQ 知识库')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('faq')
export class FaqController {
  private readonly logger = new Logger(FaqController.name);

  constructor(
    private readonly faqService: FaqService,
    private readonly chroma: FaqChromaService,
  ) {}

  /**
   * GET /api/faq — 分页 + 筛选
   */
  @Get()
  @RequirePermission('faq:view', 'faq:*')
  @ApiOperation({ summary: 'FAQ 文档列表(分页 + category / status / keyword 筛选)' })
  async list(@Query() query: QueryFaqDto) {
    return this.faqService.list(query);
  }

  /**
   * GET /api/faq/:id — 详情(含所有版本)
   */
  @Get(':id')
  @RequirePermission('faq:view', 'faq:*')
  @ApiOperation({ summary: 'FAQ 详情(含所有版本)' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.faqService.getById(id);
  }

  /**
   * GET /api/faq/:id/versions — 该文档所有版本
   */
  @Get(':id/versions')
  @RequirePermission('faq:view', 'faq:*')
  @ApiOperation({ summary: '该 FAQ 文档的所有版本' })
  async versions(@Param('id', ParseIntPipe) id: number) {
    return this.faqService.listVersions(id);
  }

  /**
   * POST /api/faq/upload — multipart 创建文档 + 第一版本
   */
  @Post('upload')
  @HttpCode(200)
  @RequirePermission('faq:create', 'faq:*')
  @ApiOperation({ summary: '上传 FAQ(创建文档 + 第一版本,status=1 待审核)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter,
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFaqDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.faqService.upload(file, dto, cu.id);
  }

  /**
   * POST /api/faq/:id/upload-version — 新版本
   */
  @Post(':id/upload-version')
  @HttpCode(200)
  @RequirePermission('faq:create', 'faq:*')
  @ApiOperation({ summary: '上传 FAQ 新版本' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter,
    }),
  )
  async uploadVersion(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFaqDto,
  ) {
    return this.faqService.uploadVersion(id, file, dto);
  }

  /**
   * PUT /api/faq/:id — 改元数据
   */
  @Put(':id')
  @RequirePermission('faq:update', 'faq:*')
  @ApiOperation({ summary: '更新 FAQ 元数据(title / category / tags / description)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFaqDto) {
    return this.faqService.update(id, dto);
  }

  /**
   * POST /api/faq/:id/review — 审核(发布/下线)
   */
  @Post(':id/review')
  @HttpCode(200)
  @RequirePermission('faq:review', 'faq:*')
  @ApiOperation({ summary: '审核 FAQ 版本(发布/下线,触发 Chroma 写入/删除)' })
  async review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewFaqDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.faqService.review(id, dto, cu.id, cu.username);
  }

  /**
   * DELETE /api/faq/:id — 软删(Chroma 全删)
   */
  @Delete(':id')
  @RequirePermission('faq:delete', 'faq:*')
  @ApiOperation({ summary: '软删 FAQ 文档(自动下线 Chroma 所有版本)' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.faqService.delete(id);
  }
}
