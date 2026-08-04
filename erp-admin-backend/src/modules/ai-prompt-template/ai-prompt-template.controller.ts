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
import { AiPromptTemplateService } from './ai-prompt-template.service';
import { CreateAiPromptTemplateDto } from './dto/create-ai-prompt-template.dto';
import { UpdateAiPromptTemplateDto } from './dto/update-ai-prompt-template.dto';
import { QueryAiPromptTemplateDto } from './dto/query-ai-prompt-template.dto';

@ApiTags('AI Prompt 模板')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('ai-prompt-templates')
export class AiPromptTemplateController {
  constructor(private readonly aiPromptTemplateService: AiPromptTemplateService) {}

  @Get()
  @RequirePermission('ai-config:view', 'ai-config:*')
  @ApiOperation({ summary: 'Prompt 模板列表' })
  async list(@Query() query: QueryAiPromptTemplateDto) {
    return this.aiPromptTemplateService.list(query);
  }

  @Get(':id')
  @RequirePermission('ai-config:view', 'ai-config:*')
  @ApiOperation({ summary: 'Prompt 模板详情' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.aiPromptTemplateService.getById(id);
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('ai-config:create', 'ai-config:*')
  @ApiOperation({ summary: '创建 Prompt 模板' })
  async create(@Body() dto: CreateAiPromptTemplateDto) {
    return this.aiPromptTemplateService.create(dto);
  }

  @Put(':id')
  @RequirePermission('ai-config:update', 'ai-config:*')
  @ApiOperation({ summary: '更新 Prompt 模板' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAiPromptTemplateDto) {
    return this.aiPromptTemplateService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('ai-config:delete', 'ai-config:*')
  @ApiOperation({ summary: '软删除 Prompt 模板' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.aiPromptTemplateService.delete(id);
  }
}
