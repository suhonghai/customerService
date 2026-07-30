import {
  Body,
  Controller,
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
import {
  CurrentUser,
  ICurrentUser,
} from '../../common/decorators/user.decorator';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-status.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { QueryTicketDto } from './dto/query-ticket.dto';

@ApiTags('工单管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  /**
   * GET /api/tickets/stats — 看板
   *   必须在 :id 路由之前定义,否则会被 :id 拦截
   */
  @Get('stats')
  @RequirePermission('ticket:view', 'ticket:*')
  @ApiOperation({ summary: '工单看板(5 个数字)' })
  async stats(@CurrentUser() cu: ICurrentUser) {
    return this.ticketService.stats(cu.id);
  }

  /**
   * GET /api/tickets — 列表
   */
  @Get()
  @RequirePermission('ticket:view', 'ticket:*')
  @ApiOperation({ summary: '工单列表(分页 + 多维筛选 + DataScope)' })
  async list(@Query() query: QueryTicketDto, @CurrentUser() cu: ICurrentUser) {
    return this.ticketService.list(query, cu.id);
  }

  /**
   * GET /api/tickets/:id — 详情(含 logs)
   */
  @Get(':id')
  @RequirePermission('ticket:view', 'ticket:*')
  @ApiOperation({ summary: '工单详情(含 logs 数组)' })
  async getById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.ticketService.getById(id, cu.id);
  }

  /**
   * POST /api/tickets — 创建
   */
  @Post()
  @HttpCode(200)
  @RequirePermission('ticket:create', 'ticket:*')
  @ApiOperation({ summary: '创建工单(自动 ticketNo + SLA deadline)' })
  async create(@Body() dto: CreateTicketDto, @CurrentUser() cu: ICurrentUser) {
    return this.ticketService.create(dto, cu.id);
  }

  /**
   * PUT /api/tickets/:id/assign — 分配
   */
  @Put(':id/assign')
  @RequirePermission('ticket:assign', 'ticket:*')
  @ApiOperation({ summary: '分配工单(改 status=2 处理中)' })
  async assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.ticketService.assign(id, dto, cu.id);
  }

  /**
   * PUT /api/tickets/:id/status — 改状态(状态机)
   */
  @Put(':id/status')
  @RequirePermission('ticket:update-status', 'ticket:*')
  @ApiOperation({ summary: '改工单状态(状态机约束)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.ticketService.updateStatus(id, dto, cu.id);
  }

  /**
   * POST /api/tickets/:id/reply — 回复
   */
  @Post(':id/reply')
  @HttpCode(200)
  @RequirePermission('ticket:reply', 'ticket:*')
  @ApiOperation({ summary: '回复工单(只写 log,不改 status)' })
  async reply(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplyTicketDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.ticketService.reply(id, dto, cu.id);
  }

  /**
   * GET /api/tickets/:id/logs — 流转日志
   */
  @Get(':id/logs')
  @RequirePermission('ticket:view', 'ticket:*')
  @ApiOperation({ summary: '工单流转日志' })
  async getLogs(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.ticketService.getLogs(id, cu.id);
  }
}
