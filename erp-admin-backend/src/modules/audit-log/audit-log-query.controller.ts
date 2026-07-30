import {
  Controller,
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
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/permission.decorator';
import { AuditLogQueryService } from './audit-log-query.service';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@ApiTags('审计日志')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
@Controller('audit-logs')
export class AuditLogQueryController {
  constructor(private readonly auditLogQueryService: AuditLogQueryService) {}

  @Get()
  @Roles('super_admin')
  @RequirePermission('audit-log:view', 'audit-log:*')
  @ApiOperation({ summary: '审计日志列表(分页 + 筛选,仅 super_admin)' })
  async list(@Query() query: QueryAuditLogDto) {
    return this.auditLogQueryService.list(query);
  }

  @Get(':id')
  @Roles('super_admin')
  @RequirePermission('audit-log:view', 'audit-log:*')
  @ApiOperation({ summary: '审计日志详情(含 oldValue / newValue)' })
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.auditLogQueryService.getById(id);
  }
}
