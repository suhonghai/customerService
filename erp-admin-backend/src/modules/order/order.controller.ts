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
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import dayjs = require('dayjs');
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { CurrentUser, ICurrentUser } from '../../common/decorators/user.decorator';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@ApiTags('订单管理')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * GET /api/orders — 列表
   */
  @Get()
  @RequirePermission('order:view', 'order:*')
  @ApiOperation({ summary: '订单列表(分页 + 多维筛选 + DataScope)' })
  async list(@Query() query: QueryOrderDto, @CurrentUser() cu: ICurrentUser) {
    return this.orderService.list(query, cu.id);
  }

  /**
   * GET /api/orders/export — CSV 导出
   * 必须在 :id 路由之前定义,否则会被 :id 拦截
   */
  @Get('export')
  @RequirePermission('order:export', 'order:*')
  @ApiOperation({ summary: '订单 CSV 导出(流式,带 BOM 防 Excel 乱码)' })
  async export(
    @Query() query: QueryOrderDto,
    @CurrentUser() cu: ICurrentUser,
    @Res() res: Response,
  ) {
    const csv = await this.orderService.exportCsv(query, cu.id);
    const filename = `orders-${dayjs().format('YYYYMMDD-HHmmss')}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  /**
   * GET /api/orders/:id — 详情(含 items)
   */
  @Get(':id')
  @RequirePermission('order:view', 'order:*')
  @ApiOperation({ summary: '订单详情(含 items 数组)' })
  async getById(@Param('id', ParseIntPipe) id: number, @CurrentUser() cu: ICurrentUser) {
    return this.orderService.getById(id, cu.id);
  }

  /**
   * POST /api/orders — 创建
   */
  @Post()
  @HttpCode(200)
  @RequirePermission('order:create', 'order:*')
  @ApiOperation({ summary: '创建订单(自动生成 orderNo + 关联 items)' })
  async create(@Body() dto: CreateOrderDto, @CurrentUser() cu: ICurrentUser) {
    return this.orderService.create(dto, cu.id);
  }

  /**
   * PUT /api/orders/:id — 修改地址/备注
   */
  @Put(':id')
  @RequirePermission('order:update', 'order:*')
  @ApiOperation({ summary: '修改订单地址 / 备注' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.orderService.update(id, dto, cu.id);
  }

  /**
   * PUT /api/orders/:id/status — 改状态(状态机)
   */
  @Put(':id/status')
  @RequirePermission('order:update-status', 'order:*')
  @ApiOperation({ summary: '改订单状态(状态机约束)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.orderService.updateStatus(id, dto, cu.id);
  }

  /**
   * POST /api/orders/:id/refund — 退款
   */
  @Post(':id/refund')
  @HttpCode(200)
  @RequirePermission('order:refund', 'order:*')
  @ApiOperation({ summary: '订单退款(全退 payStatus=3 / 部分退 payStatus=4)' })
  async refund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RefundOrderDto,
    @CurrentUser() cu: ICurrentUser,
  ) {
    return this.orderService.refund(id, dto, cu.id, cu.username);
  }
}
