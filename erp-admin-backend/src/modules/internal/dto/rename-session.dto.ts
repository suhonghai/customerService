import { IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/internal/cs/sessions/by-key/:sessionKey — 重命名会话
 *
 * cs-round-042:用户主动改 sidebar 会话标题时,ai-cs-demo 浏览器 → BFF
 * → backend 此 endpoint,更新 csSession.visitorName(项目里 title 字段
 * 即复用 visitorName,schema 当前实际列就是 visitor_name)。
 *
 * 字段约束对齐 csSession.visitorName:
 *   @db.VarChar(50)  →  MaxLength(50) 截断保护
 */
export class RenameSessionDto {
  @IsString()
  @MaxLength(50)
  title!: string;
}
