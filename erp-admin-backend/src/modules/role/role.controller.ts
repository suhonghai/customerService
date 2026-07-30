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
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRoleDto } from './dto/query-role.dto';
import { AssignMenusDto } from './dto/assign-menus.dto';

@ApiTags('角色管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('role:view')
  @ApiOperation({ summary: '角色列表(分页 + 筛选)' })
  async list(@Query() query: QueryRoleDto) {
    return this.roleService.list(query);
  }

  @Post()
  @HttpCode(200)
  @Roles('super_admin')
  @RequirePermission('role:create')
  @ApiOperation({ summary: '创建角色' })
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Get(':id')
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('role:view')
  @ApiOperation({ summary: '角色详情(含 menuIds)' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getById(id);
  }

  @Put(':id')
  @Roles('super_admin')
  @RequirePermission('role:update')
  @ApiOperation({ summary: '更新角色' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @Roles('super_admin')
  @RequirePermission('role:delete')
  @ApiOperation({ summary: '软删除角色' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.delete(id);
  }

  @Put(':id/menus')
  @HttpCode(200)
  @Roles('super_admin')
  @RequirePermission('role:assign-menu')
  @ApiOperation({ summary: '分配菜单' })
  async assignMenus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignMenusDto,
  ) {
    return this.roleService.assignMenus(id, dto);
  }

  @Get(':id/menus')
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('role:view')
  @ApiOperation({ summary: '查询角色已分配 menuIds' })
  async getMenus(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getMenus(id);
  }
}
