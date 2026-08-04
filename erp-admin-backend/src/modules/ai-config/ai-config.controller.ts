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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { CurrentUser, ICurrentUser } from '../../common/decorators/user.decorator';
import { AiConfigService } from './ai-config.service';
import { CreateAiConfigDto } from './dto/create-ai-config.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { QueryAiConfigDto } from './dto/query-ai-config.dto';
import { TestAiConfigDto } from './dto/test-ai-config.dto';

@ApiTags('AI 模型配置')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('ai-configs')
export class AiConfigController {
  constructor(private readonly aiConfigService: AiConfigService) {}

  @Get()
  @RequirePermission('ai-config:view', 'ai-config:*')
  @ApiOperation({ summary: 'AI 配置列表(分页 + 筛选)' })
  async list(@Query() query: QueryAiConfigDto) {
    return this.aiConfigService.list(query);
  }

  @Get('active')
  @RequirePermission('ai-config:view', 'ai-config:*')
  @ApiOperation({ summary: '当前默认 AI 配置(返明文 apiKey,internal 用)' })
  async getActive(@CurrentUser() cu: ICurrentUser) {
    return this.aiConfigService.getActive(cu);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('ai-config:create', 'ai-config:*')
  @ApiOperation({ summary: '创建 AI 配置(apiKey 入库前加密)' })
  async create(@Body() dto: CreateAiConfigDto) {
    return this.aiConfigService.create(dto);
  }

  @Get(':id')
  @RequirePermission('ai-config:view', 'ai-config:*')
  @ApiOperation({ summary: 'AI 配置详情' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.aiConfigService.getById(id);
  }

  @Put(':id')
  @RequirePermission('ai-config:update', 'ai-config:*')
  @ApiOperation({ summary: '更新 AI 配置(apiKey 传了则重加密)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAiConfigDto) {
    return this.aiConfigService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('ai-config:delete', 'ai-config:*')
  @ApiOperation({ summary: '软删除 AI 配置' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.aiConfigService.delete(id);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePermission('ai-config:test', 'ai-config:*')
  @ApiOperation({ summary: '测试 AI 配置连通性(实调 LLM)' })
  async test(@Param('id', ParseIntPipe) id: number, @Body() dto: TestAiConfigDto) {
    return this.aiConfigService.test(id, dto);
  }

  @Post(':id/set-default')
  @HttpCode(200)
  @RequirePermission('ai-config:update', 'ai-config:*')
  @ApiOperation({ summary: '设为默认配置(事务)' })
  async setDefault(@Param('id', ParseIntPipe) id: number) {
    return this.aiConfigService.setDefault(id);
  }
}
