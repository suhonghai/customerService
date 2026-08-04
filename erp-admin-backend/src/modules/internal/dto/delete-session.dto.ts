import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DELETE /api/internal/cs/sessions/:id — 软删会话
 *
 * 当前 controller 不读 body(path 参数即 id)。
 * 保留 DTO 类是为后续给 ai-cs-demo / erp-admin 传 reason(软删原因/审计)留口,
 * 现在可选,缺省不写日志附加字段。
 */
export class DeleteSessionDto {
  @ApiPropertyOptional({ description: '软删原因(审计/日志用,可选)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
