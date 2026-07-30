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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser, type ICurrentUser } from '../../common/decorators/user.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { MenuService } from './menu.service';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@ApiTags('菜单管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('menus')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('menu:view')
  @ApiOperation({ summary: '菜单扁平列表' })
  async list() {
    return this.menuService.list();
  }

  @Get('tree')
  // 任何登录用户都可查菜单树(树本身已按用户角色绑定的菜单过滤,无需 menu:view)
  @ApiOperation({ summary: '菜单树(供前端 sidebar)— 已按当前用户角色过滤' })
  async tree(@CurrentUser() user: ICurrentUser) {
    return this.menuService.treeForUser(user.id);
  }

  @Post()
  @HttpCode(200)
  @Roles('super_admin')
  @RequirePermission('menu:create')
  @ApiOperation({ summary: '创建菜单' })
  async create(@Body() dto: CreateMenuDto) {
    return this.menuService.create(dto);
  }

  @Put(':id')
  @Roles('super_admin')
  @RequirePermission('menu:update')
  @ApiOperation({ summary: '更新菜单' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  @RequirePermission('menu:delete')
  @ApiOperation({ summary: '软删除菜单' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.delete(id);
  }
}
