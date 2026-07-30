import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BizException, BizCode } from '../../common/exceptions/biz.exception';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateDictTypeDto } from './dto/create-dict-type.dto';
import { CreateDictItemDto } from './dto/create-dict-item.dto';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';

/**
 * DictService(Day 8)
 *
 * 接口:
 * - GET    /api/dicts/types             字典类型列表(带 itemCount)
 * - GET    /api/dicts/:code             指定 code 的所有项(按 sort asc)
 * - POST   /api/dicts/types             创建类型
 * - POST   /api/dicts/:code/items       加项
 * - PUT    /api/dicts/items/:id         更新项
 * - DELETE /api/dicts/items/:id         软删项(DictItem 无 deletedAt,用 status=0 表示)
 *
 * 注:DictItem 没有 deletedAt 字段,不在软删中间件中;
 *   - 删除 = update status = 0(status 字段表示 1 启用 / 0 禁用)
 *   - 列表 = where status = 1(只返启用的)
 */
@Injectable()
export class DictService {
  private readonly logger = new Logger(DictService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  // ============================================================
  // GET /api/dicts/types — 字典类型列表(带 itemCount)
  //   软删中间件已自动过滤 DictType deletedAt=null
  // ============================================================
  async getTypes() {
    const types = await this.prisma.dictType.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    // 真实启用的 item 数(逐个 type 查,数据量小可接受)
    const result: {
      id: number;
      code: string;
      name: string;
      remark: string | null;
      itemCount: number;
      activeItemCount: number;
      createdAt: Date;
      updatedAt: Date;
    }[] = [];
    for (const t of types) {
      const activeItemCount = await this.prisma.dictItem.count({
        where: { typeId: t.id, status: 1 },
      });
      result.push({
        id: t.id,
        code: t.code,
        name: t.name,
        remark: t.remark,
        itemCount: t._count.items,
        activeItemCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      });
    }
    return result;
  }

  // ============================================================
  // GET /api/dicts/:code — 取指定 code 的所有项(按 sort asc)
  //   软删中间件已过滤 DictType / DictItem deletedAt
  // ============================================================
  async getByCode(code: string) {
    const type = await this.prisma.dictType.findUnique({
      where: { code },
    });
    if (!type) {
      throw new BizException(BizCode.BIZ_ERROR, `字典类型 ${code} 不存在`);
    }
    const items = await this.prisma.dictItem.findMany({
      where: { typeId: type.id, status: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return items;
  }

  // ============================================================
  // POST /api/dicts/types — 创建类型
  // ============================================================
  async createType(dto: CreateDictTypeDto, currentUserId: number) {
    // 校验 code 唯一(中间件 findUnique 会过滤 deletedAt=null;但新创时若同名有软删也 OK 复用,这里要求严格不重复)
    const exist = await this.prisma.dictType.findUnique({
      where: { code: dto.code },
    });
    if (exist) {
      throw new BizException(BizCode.BIZ_ERROR, `字典 code 已存在: ${dto.code}`);
    }
    const created = await this.prisma.dictType.create({
      data: {
        code: dto.code,
        name: dto.name,
        remark: dto.remark ?? null,
      },
    });
    void this.audit.create({
      userId: currentUserId,
      module: 'dict',
      action: 'create-type',
      resource: 'dict_type',
      resourceId: String(created.id),
      method: 'POST',
      path: '/api/dicts/types',
      params: { code: dto.code, name: dto.name },
      newValue: { id: created.id, code: created.code, name: created.name },
      status: 1,
    });
    return created;
  }

  // ============================================================
  // POST /api/dicts/:code/items — 加项
  // ============================================================
  async createItem(
    code: string,
    dto: CreateDictItemDto,
    currentUserId: number,
  ) {
    const type = await this.prisma.dictType.findUnique({ where: { code } });
    if (!type) {
      throw new BizException(BizCode.BIZ_ERROR, `字典类型 ${code} 不存在`);
    }
    // 同 type 下 value 唯一(有 @unique([typeId, value]))
    try {
      const created = await this.prisma.dictItem.create({
        data: {
          typeId: type.id,
          label: dto.label,
          value: dto.value,
          sort: dto.sort ?? 0,
          isDefault: dto.isDefault ?? false,
          cssClass: dto.cssClass ?? null,
          remark: dto.remark ?? null,
        },
      });
      void this.audit.create({
        userId: currentUserId,
        module: 'dict',
        action: 'create-item',
        resource: 'dict_item',
        resourceId: String(created.id),
        method: 'POST',
        path: `/api/dicts/${code}/items`,
        params: { typeCode: code, label: dto.label, value: dto.value },
        newValue: { id: created.id, label: created.label, value: created.value },
        status: 1,
      });
      return created;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(
          BizCode.BIZ_ERROR,
          `同类型下 value 重复: ${dto.value}`,
        );
      }
      throw e;
    }
  }

  // ============================================================
  // PUT /api/dicts/items/:id — 更新项
  // ============================================================
  async updateItem(
    id: number,
    dto: UpdateDictItemDto,
    currentUserId: number,
  ) {
    const exist = await this.prisma.dictItem.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.BIZ_ERROR, '字典项不存在');
    }
    const data: Prisma.DictItemUpdateInput = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.sort !== undefined) data.sort = dto.sort;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
    if (dto.cssClass !== undefined) data.cssClass = dto.cssClass;
    if (dto.remark !== undefined) data.remark = dto.remark;

    try {
      const updated = await this.prisma.dictItem.update({
        where: { id },
        data,
      });
      void this.audit.create({
        userId: currentUserId,
        module: 'dict',
        action: 'update-item',
        resource: 'dict_item',
        resourceId: String(id),
        method: 'PUT',
        path: `/api/dicts/items/${id}`,
        params: { changedKeys: Object.keys(data) },
        oldValue: {
          label: exist.label,
          value: exist.value,
          sort: exist.sort,
          isDefault: exist.isDefault,
          cssClass: exist.cssClass,
        },
        newValue: data,
        status: 1,
      });
      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BizException(BizCode.BIZ_ERROR, '同类型下 value 重复');
      }
      throw e;
    }
  }

  // ============================================================
  // DELETE /api/dicts/items/:id — 软删(中间件:delete → update deletedAt=NOW())
  // ============================================================
  async removeItem(id: number, currentUserId: number) {
    const exist = await this.prisma.dictItem.findUnique({ where: { id } });
    if (!exist) {
      throw new BizException(BizCode.BIZ_ERROR, '字典项不存在');
    }
    // 软删(中间件自动转 update deletedAt = NOW())
    await this.prisma.dictItem.delete({ where: { id } });
    void this.audit.create({
      userId: currentUserId,
      module: 'dict',
      action: 'delete-item',
      resource: 'dict_item',
      resourceId: String(id),
      method: 'DELETE',
      path: `/api/dicts/items/${id}`,
      params: { typeId: exist.typeId, label: exist.label, value: exist.value },
      status: 1,
    });
    return { id, deleted: true };
  }
}
