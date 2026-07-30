import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import dayjs = require('dayjs');
import { stringify as csvStringify } from 'csv-stringify/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DataScopeService } from '../../common/services/data-scope.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-status.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

/**
 * 订单状态机(Day 6)
 *
 * 状态码:
 * 1 待发货  2 已发货  3 已收货  4 已完成  5 已取消
 *
 * 合法转换 + 约束:
 * - 1→2 { require: ['shipNo','shipCompany'], set: { shippedAt: now } }
 * - 2→3 { require: [],                       set: { receivedAt: now } }
 * - 3→4 { require: [],                       set: { completedAt: now } }
 * - 1→5 { require: [],                       set: { cancelledAt: now } }
 * - 2→5 { require: [],                       set: { cancelledAt: now } }
 *
 * 4→5 不允许(已完成订单不能取消);其它任何转换都不允许
 */
type TransitionKey = `${number}->${number}`;

interface Transition {
  require: ReadonlyArray<'shipNo' | 'shipCompany'>;
  set: Record<string, Date | null>;
}

const TRANSITIONS: Record<TransitionKey, Transition> = {
  '1->2': {
    require: ['shipNo', 'shipCompany'],
    set: {}, // set shippedAt in runtime
  },
  '2->3': { require: [], set: {} },
  '3->4': { require: [], set: {} },
  '1->5': { require: [], set: {} },
  '2->5': { require: [], set: {} },
};

const STATUS_LABELS: Record<number, string> = {
  1: '待发货',
  2: '已发货',
  3: '已收货',
  4: '已完成',
  5: '已取消',
};

const PAY_STATUS_LABELS: Record<number, string> = {
  1: '待支付',
  2: '已支付',
  3: '已退款',
  4: '部分退款',
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly dataScope: DataScopeService,
  ) {}

  // ============================================================
  // GET /api/orders — 列表(分页 + 多维筛选 + DataScope)
  // ============================================================
  async list(query: QueryOrderDto, currentUserId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = { deletedAt: null };

    // 1) 业务筛选
    if (query.orderNo) where.orderNo = { contains: query.orderNo };
    if (query.customerName) {
      where.customerName = { contains: query.customerName };
    }
    if (query.customerPhone) {
      where.customerPhone = { contains: query.customerPhone };
    }
    if (query.orderStatus !== undefined) where.orderStatus = query.orderStatus;
    if (query.payStatus !== undefined) where.payStatus = query.payStatus;
    if (query.payMethod) where.payMethod = query.payMethod;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        // endDate 含当天 → +1 天减 1ms(或直接 < 23:59:59.999)
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.payAmount = {};
      if (query.minAmount !== undefined) where.payAmount.gte = query.minAmount;
      if (query.maxAmount !== undefined) where.payAmount.lte = query.maxAmount;
    }

    // 2) DataScope 过滤
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applyOrderWhere(where, currentUserId, scope);

    const sortField = query.sortBy ?? 'id';
    const sortOrder = query.sortOrder ?? 'desc';
    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [sortField]: sortOrder,
    } as Prisma.OrderOrderByWithRelationInput;

    const [list, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: true,
          user: {
            select: { id: true, username: true, nickname: true, departmentId: true },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      list: list.map((o) => this.toSafeOrder(o)),
      total,
      page,
      pageSize,
    };
  }

  // ============================================================
  // GET /api/orders/:id — 详情(含 items)
  // ============================================================
  async getById(id: number, currentUserId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        user: {
          select: { id: true, username: true, nickname: true, departmentId: true },
        },
      },
    });
    if (!order || order.deletedAt) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在');
    }
    // DataScope 校验:看权限范围内能不能看到这个订单
    const scope = await this.dataScope.getUserDataScope(currentUserId);
    if (scope.scope !== 1) {
      const inScope = await this.isInOrderScope(order, currentUserId, scope);
      if (!inScope) {
        throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在');
      }
    }
    return this.toSafeOrder(order);
  }

  // ============================================================
  // POST /api/orders — 创建订单(自动生成 orderNo,事务 + items 联动)
  // ============================================================
  async create(dto: CreateOrderDto, currentUserId: number) {
    if (!dto.items || dto.items.length === 0) {
      throw new BizException(BizCode.PARAM_ERROR, '订单至少包含 1 个商品');
    }
    const totalAmount = dto.items.reduce(
      (sum, i) => sum + Number(i.price) * Number(i.quantity),
      0,
    );

    // 订单号生成(P2002 重试 3 次)
    let order;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        order = await this.prisma.$transaction(async (tx) => {
          const orderNo = await this.generateOrderNo(tx);
          const created = await tx.order.create({
            data: {
              orderNo,
              userId: currentUserId,
              customerName: dto.customerName,
              customerPhone: dto.customerPhone,
              customerEmail: dto.customerEmail ?? null,
              totalAmount,
              payAmount: totalAmount,
              payMethod: dto.payMethod ?? null,
              payStatus: 1,
              orderStatus: 1,
              address: dto.address,
              remark: dto.remark ?? null,
              items: {
                create: dto.items.map((i) => ({
                  productId: i.productId,
                  productName: i.productName,
                  productSku: i.productSku ?? null,
                  price: i.price,
                  quantity: i.quantity,
                  subtotal: Number(i.price) * Number(i.quantity),
                })),
              },
            },
            include: { items: true },
          });
          return created;
        });
        break;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          this.logger.warn(
            `订单号冲突,重试 attempt=${attempt + 1}: ${(e as Error).message}`,
          );
          if (attempt === 2) {
            throw new BizException(
              BizCode.SERVER_ERROR,
              '订单号生成失败(并发冲突),请重试',
            );
          }
          continue;
        }
        throw e;
      }
    }

    void this.audit.create({
      userId: currentUserId,
      module: 'order',
      action: 'create',
      resource: 'order',
      resourceId: String(order!.id),
      method: 'POST',
      path: '/api/orders',
      params: { orderNo: order!.orderNo, totalAmount },
      newValue: { id: order!.id, orderNo: order!.orderNo },
      status: 1,
    });

    return this.toSafeOrder(order!);
  }

  // ============================================================
  // PUT /api/orders/:id — 修改地址 / 备注
  // ============================================================
  async update(id: number, dto: UpdateOrderDto, currentUserId: number) {
    const exist = await this.prisma.order.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在');
    }
    if (exist.orderStatus === 5) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        '已取消订单不可修改',
      );
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        address: dto.address ?? undefined,
        remark: dto.remark ?? undefined,
      },
      include: { items: true },
    });

    void this.audit.create({
      userId: currentUserId,
      module: 'order',
      action: 'update',
      resource: 'order',
      resourceId: String(id),
      method: 'PUT',
      path: `/api/orders/${id}`,
      params: dto,
      oldValue: { address: exist.address, remark: exist.remark },
      newValue: { address: updated.address, remark: updated.remark },
      status: 1,
    });

    return this.toSafeOrder(updated);
  }

  // ============================================================
  // PUT /api/orders/:id/status — 改状态(状态机约束)
  // ============================================================
  async updateStatus(
    id: number,
    dto: UpdateOrderStatusDto,
    currentUserId: number,
  ) {
    const exist = await this.prisma.order.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在');
    }

    const from = exist.orderStatus;
    const to = dto.newStatus;
    if (from === to) {
      throw new BizException(BizCode.STATE_NOT_ALLOW, '订单已是该状态');
    }
    const key: TransitionKey = `${from}->${to}`;
    const transition = TRANSITIONS[key];
    if (!transition) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        `状态不允许此操作:${STATUS_LABELS[from] ?? from} → ${STATUS_LABELS[to] ?? to}`,
      );
    }

    // 必填字段校验
    for (const field of transition.require) {
      const value = (dto as unknown as Record<string, unknown>)[field];
      if (value == null || value === '') {
        throw new BizException(
          BizCode.PARAM_MISSING,
          `${STATUS_LABELS[from]} → ${STATUS_LABELS[to]} 需要传入 ${field}`,
        );
      }
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { orderStatus: dto.newStatus };

    if (key === '1->2') {
      data.shipNo = dto.shipNo!;
      data.shipCompany = dto.shipCompany!;
      data.shippedAt = now;
    } else if (key === '2->3') {
      data.receivedAt = now;
    } else if (key === '3->4') {
      data.completedAt = now;
    } else if (key === '1->5' || key === '2->5') {
      data.cancelledAt = now;
    }

    if (dto.paidAt) {
      data.paidAt = new Date(dto.paidAt);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: { items: true },
    });

    void this.audit.create({
      userId: currentUserId,
      module: 'order',
      action: 'update-status',
      resource: 'order',
      resourceId: String(id),
      method: 'PUT',
      path: `/api/orders/${id}/status`,
      params: { from, to, ...dto },
      oldValue: { orderStatus: from },
      newValue: { orderStatus: to },
      status: 1,
    });

    return this.toSafeOrder(updated);
  }

  // ============================================================
  // POST /api/orders/:id/refund — 退款(全退 / 部分退)
  // ============================================================
  async refund(
    id: number,
    dto: RefundOrderDto,
    currentUserId: number,
    currentUsername?: string,
  ) {
    const exist = await this.prisma.order.findUnique({ where: { id } });
    if (!exist || exist.deletedAt) {
      throw new BizException(BizCode.ORDER_NOT_FOUND, '订单不存在');
    }
    if (![2, 3, 4].includes(exist.payStatus)) {
      throw new BizException(
        BizCode.STATE_NOT_ALLOW,
        `订单当前支付状态 ${PAY_STATUS_LABELS[exist.payStatus] ?? exist.payStatus} 不允许退款`,
      );
    }

    const alreadyRefunded = Number(exist.refundAmount ?? 0);
    const remaining = Number(exist.payAmount) - alreadyRefunded;
    if (dto.refundAmount > remaining + 0.001) {
      throw new BizException(
        BizCode.PARAM_ERROR,
        `退款金额超限:本次最多可退 ¥${remaining.toFixed(2)}`,
      );
    }

    const newRefunded = alreadyRefunded + dto.refundAmount;
    const isFullRefund = Math.abs(newRefunded - Number(exist.payAmount)) < 0.001;
    const newPayStatus = isFullRefund ? 3 : 4;

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.order.update({
        where: { id },
        data: {
          refundAmount: newRefunded,
          refundedAt: new Date(),
          payStatus: newPayStatus,
        },
        include: { items: true },
      });
    });

    void this.audit.create({
      userId: currentUserId,
      username: currentUsername ?? null,
      module: 'order',
      action: 'refund',
      resource: 'order',
      resourceId: String(id),
      method: 'POST',
      path: `/api/orders/${id}/refund`,
      params: { refundAmount: dto.refundAmount, reason: dto.reason },
      oldValue: {
        payStatus: exist.payStatus,
        refundAmount: exist.refundAmount ?? 0,
      },
      newValue: {
        payStatus: newPayStatus,
        refundAmount: newRefunded,
      },
      status: 1,
    });

    return this.toSafeOrder(updated);
  }

  // ============================================================
  // GET /api/orders/export — CSV 导出(流式,DataScope)
  //   返回 CSV 文本字符串(controller 负责 setHeader + send)
  // ============================================================
  async exportCsv(query: QueryOrderDto, currentUserId: number): Promise<string> {
    const where: Prisma.OrderWhereInput = { deletedAt: null };

    // 业务筛选(同 list)
    if (query.orderNo) where.orderNo = { contains: query.orderNo };
    if (query.customerName) {
      where.customerName = { contains: query.customerName };
    }
    if (query.customerPhone) {
      where.customerPhone = { contains: query.customerPhone };
    }
    if (query.orderStatus !== undefined) where.orderStatus = query.orderStatus;
    if (query.payStatus !== undefined) where.payStatus = query.payStatus;
    if (query.payMethod) where.payMethod = query.payMethod;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }
    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.payAmount = {};
      if (query.minAmount !== undefined) where.payAmount.gte = query.minAmount;
      if (query.maxAmount !== undefined) where.payAmount.lte = query.maxAmount;
    }

    const scope = await this.dataScope.getUserDataScope(currentUserId);
    this.dataScope.applyOrderWhere(where, currentUserId, scope);

    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 5000, // 限制单次导出
      include: {
        user: {
          select: { username: true, nickname: true },
        },
      },
    });

    const records = rows.map((o) => ({
      orderNo: o.orderNo,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      payAmount: Number(o.payAmount).toFixed(2),
      payMethod: o.payMethod ?? '',
      orderStatusLabel: STATUS_LABELS[o.orderStatus] ?? String(o.orderStatus),
      createdAt: dayjs(o.createdAt).format('YYYY-MM-DD HH:mm:ss'),
      creator: o.user?.nickname ?? o.user?.username ?? '',
    }));

    const csv = csvStringify(records, {
      header: true,
      columns: [
        'orderNo',
        'customerName',
        'customerPhone',
        'payAmount',
        'payMethod',
        'orderStatusLabel',
        'createdAt',
        'creator',
      ],
      bom: true, // UTF-8 BOM,Excel 打开不乱码
    });

    void this.audit.create({
      userId: currentUserId,
      module: 'order',
      action: 'export',
      resource: 'order',
      method: 'GET',
      path: '/api/orders/export',
      params: { count: records.length, filters: query },
      status: 1,
    });

    return csv;
  }

  // ============================================================
  // 内部 helpers
  // ============================================================

  /**
   * 订单号生成:ORD-YYYYMMDDXXX(每日 001 起)
   * 用 count + 1 实现,并发冲突由 P2002 重试兜底
   */
  private async generateOrderNo(
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = (tx ?? this.prisma) as Prisma.TransactionClient;
    const today = dayjs().format('YYYYMMDD');
    const count = await client.order.count({
      where: { orderNo: { startsWith: `ORD-${today}` } },
    });
    return `ORD-${today}${String(count + 1).padStart(3, '0')}`;
  }

  /**
   * 把 order 实体转成安全 DTO(Decimal → Number,剥 _omit 字段)
   */
  private toSafeOrder(o: {
    id: number;
    orderNo: string;
    userId: number | null;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    totalAmount: Prisma.Decimal | number;
    payAmount: Prisma.Decimal | number;
    payMethod: string | null;
    payStatus: number;
    orderStatus: number;
    shipNo: string | null;
    shipCompany: string | null;
    address: string | null;
    remark: string | null;
    paidAt: Date | null;
    shippedAt: Date | null;
    receivedAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    refundedAt: Date | null;
    refundAmount: Prisma.Decimal | number | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    items?: {
      id: number;
      orderId: number;
      productId: string;
      productName: string;
      productSku: string | null;
      price: Prisma.Decimal | number;
      quantity: number;
      subtotal: Prisma.Decimal | number;
      createdAt: Date;
    }[];
    user?: {
      id: number;
      username: string;
      nickname: string | null;
      departmentId: number | null;
    } | null;
  }) {
    return {
      id: o.id,
      orderNo: o.orderNo,
      userId: o.userId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerEmail: o.customerEmail,
      totalAmount: Number(o.totalAmount),
      payAmount: Number(o.payAmount),
      payMethod: o.payMethod,
      payStatus: o.payStatus,
      payStatusLabel: PAY_STATUS_LABELS[o.payStatus] ?? String(o.payStatus),
      orderStatus: o.orderStatus,
      orderStatusLabel: STATUS_LABELS[o.orderStatus] ?? String(o.orderStatus),
      shipNo: o.shipNo,
      shipCompany: o.shipCompany,
      address: o.address,
      remark: o.remark,
      paidAt: o.paidAt,
      shippedAt: o.shippedAt,
      receivedAt: o.receivedAt,
      completedAt: o.completedAt,
      cancelledAt: o.cancelledAt,
      refundedAt: o.refundedAt,
      refundAmount:
        o.refundAmount != null ? Number(o.refundAmount) : null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      items: (o.items ?? []).map((it) => ({
        id: it.id,
        productId: it.productId,
        productName: it.productName,
        productSku: it.productSku,
        price: Number(it.price),
        quantity: it.quantity,
        subtotal: Number(it.subtotal),
      })),
      creator: o.user
        ? {
            id: o.user.id,
            username: o.user.username,
            nickname: o.user.nickname,
            departmentId: o.user.departmentId,
          }
        : null,
    };
  }

  /**
   * 校验单个 order 是否在当前用户 DataScope 内
   */
  private async isInOrderScope(
    order: { userId: number | null },
    currentUserId: number,
    scope: { scope: number; deptId?: number; customDeptIds?: number[] },
  ): Promise<boolean> {
    if (scope.scope === 1) return true;
    if (scope.scope === 2) {
      if (scope.deptId == null) {
        return order.userId === currentUserId;
      }
      const u = await this.prisma.user.findUnique({
        where: { id: order.userId ?? -1 },
        select: { departmentId: true },
      });
      return u?.departmentId === scope.deptId;
    }
    if (scope.scope === 3) {
      return order.userId === currentUserId;
    }
    if (scope.scope === 4) {
      if (!scope.customDeptIds || scope.customDeptIds.length === 0) {
        return order.userId === currentUserId;
      }
      const u = await this.prisma.user.findUnique({
        where: { id: order.userId ?? -1 },
        select: { departmentId: true },
      });
      return u?.departmentId != null && scope.customDeptIds.includes(u.departmentId);
    }
    return false;
  }
}