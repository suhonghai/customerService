import { PartialType } from '@nestjs/swagger';
import { CreateRoleDto } from './create-role.dto';

/**
 * 更新角色 DTO
 * - 全部字段可选
 * - code 改了需 service 校验唯一性
 * - code 不允许改成内置角色的 code(可选用业务规则,这里仅做格式校验)
 */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
