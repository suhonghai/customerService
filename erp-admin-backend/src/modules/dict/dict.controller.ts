import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { CurrentUser, ICurrentUser } from '../../common/decorators/user.decorator';
import { DictService } from './dict.service';
import { CreateDictTypeDto } from './dto/create-dict-type.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';

@ApiTags('数据字典')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('dicts')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  /**
   * GET /api/dicts/types — 字典类型列表
   *   注意:必须在 :code 路由之前定义
   */
  @Get('types')
  @RequirePermission('dict:view', 'dict:*')
  @ApiOperation({ summary: '字典类型列表(带 itemCount)' })
  async getTypes() {
    return this.dictService.getTypes();
  }

  /**
   * GET /api/dicts/:code — 指定 code 的所有项
   */
  @Get(':code')
  @RequirePermission('dict:view', 'dict:*')
  @ApiOperation({ summary: '指定 code 的字典项' })
  async getByCode(@Param('code') code: string) {
    return this.dictService.getByCode(code);
  }

  /**
   * POST /api/dicts/types — 创建字典类型
   */
  @Post('types')
  @RequirePermission('dict:create', 'dict:*')
  @ApiOperation({ summary: '创建字典类型' })
  async createType(@Body() dto: CreateDictTypeDto, @CurrentUser() cu: ICurrentUser) {
    return this.dictService.createType(dto, cu.id);
  }

  /**
   * POST /api/dicts/:code/items — 加项
   */
  @Post(':code/items')
  @RequirePermission('dict:create', 'dict:*')
  @ApiOperation({ summary: '新增字典项' })
  async createItem(
    @Param('code') code: string,
    @Body() dto: CreateDictItemDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.dictService.createItem(code, dto, cu.id);
  }

  /**
   * PUT /api/dicts/items/:id — 更新项
   *   注意:不能用 :code 路由前缀,放到 /items/:id 避免冲突
   */
  @Put('items/:id')
  @RequirePermission('dict:update', 'dict:*')
  @ApiOperation({ summary: '更新字典项' })
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDictItemDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.dictService.updateItem(id, dto, cu.id);
  }

  /**
   * DELETE /api/dicts/items/:id — 软删项
   */
  @Delete('items/:id')
  @RequirePermission('dict:delete', 'dict:*')
  @ApiOperation({ summary: '软删字典项' })
  async removeItem(@Param('id', ParseIntPipe) id: number, @CurrentUser() cu: ICurrentUser) {
    return this.dictService.removeItem(id, cu.id);
  }
}
