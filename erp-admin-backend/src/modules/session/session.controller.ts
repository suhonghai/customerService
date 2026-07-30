import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import {
  CurrentUser,
  ICurrentUser,
} from '../../common/decorators/user.decorator';
import { SessionService } from './session.service';
import { QuerySessionDto } from './dto/query-session.dto';
import { QueryMessagesDto } from './dto/query-messages.dto';

@ApiTags('会话管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  /**
   * GET /api/sessions — 列表(分页 + 多维筛选 + DataScope)
   */
  @Get()
  @RequirePermission('session:view', 'session:*')
  @ApiOperation({ summary: '会话列表(分页 + 筛选 + DataScope)' })
  async list(@Query() query: QuerySessionDto, @CurrentUser() cu: ICurrentUser) {
    return this.sessionService.list(query, cu.id);
  }

  /**
   * GET /api/sessions/:id — 详情(含 messageCount + 最近一条预览)
   */
  @Get(':id')
  @RequirePermission('session:view', 'session:*')
  @ApiOperation({ summary: '会话详情' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.sessionService.findOne(id, cu.id);
  }

  /**
   * GET /api/sessions/:id/messages — 消息分页
   */
  @Get(':id/messages')
  @RequirePermission('session:view-messages', 'session:*')
  @ApiOperation({ summary: '会话消息列表(分页)' })
  async findMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryMessagesDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.sessionService.findMessages(id, query, cu.id);
  }

  /**
   * DELETE /api/sessions/:id — 软删(GDPR)
   */
  @Delete(':id')
  @RequirePermission('session:delete', 'session:*')
  @ApiOperation({ summary: '软删会话(GDPR)' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.sessionService.remove(id, cu.id);
  }
}
