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
import { CurrentUser, ICurrentUser } from '../../common/decorators/user.decorator';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';

@ApiTags('用户管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Roles('super_admin', 'agent_lead', 'agent', 'editor')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户列表(分页 + 筛选 + DataScope)' })
  async list(@Query() query: QueryUserDto, @CurrentUser() cu: ICurrentUser) {
    return this.userService.list(query, cu.id);
  }

  @Post()
  @HttpCode(200)
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('user:create')
  @ApiOperation({ summary: '创建用户' })
  async create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get(':id')
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('user:view')
  @ApiOperation({ summary: '用户详情' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.userService.getById(id);
  }

  @Put(':id')
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('user:update')
  @ApiOperation({ summary: '更新用户' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.userService.update(id, dto, cu.id);
  }

  @Delete(':id')
  @Roles('super_admin')
  @RequirePermission('user:delete')
  @ApiOperation({ summary: '软删除用户' })
  async delete(@Param('id', ParseIntPipe) id: number, @CurrentUser() cu: ICurrentUser) {
    return this.userService.delete(id, cu.id);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Roles('super_admin')
  @RequirePermission('user:reset-password')
  @ApiOperation({ summary: '重置密码(吊销所有 refresh token)' })
  async resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto);
  }

  @Post(':id/toggle-status')
  @HttpCode(200)
  @Roles('super_admin', 'agent_lead')
  @RequirePermission('user:update')
  @ApiOperation({ summary: '启用/禁用用户' })
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @CurrentUser() cu: ICurrentUser) {
    return this.userService.toggleStatus(id, cu.id);
  }

  @Post(':id/roles')
  @HttpCode(200)
  @Roles('super_admin')
  @RequirePermission('user:assign-role')
  @ApiOperation({ summary: '分配角色' })
  async assignRoles(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignRolesDto) {
    return this.userService.assignRoles(id, dto);
  }
}
