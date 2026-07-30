import { IsInt, IsOptional, IsString } from 'class-validator';

/**
 * PATCH /api/internal/cs/sessions/:id/messages/:msgId — 增量更新消息
 *
 * 用于 ai-cs-demo 流式持久化:
 *  - streaming 中每 500ms PATCH 一次,带完整 parts(AI SDK UI Message parts)
 *  - 流结束(status=3 done)后不再 PATCH
 *
 * content: 累积的文本(可空,tool 消息 parts 占位)
 * parts:   AI SDK UI Message parts(opaque 结构,不强 schema 校验 — 数组 vs 对象)
 * metadata:任意 JSON
 * status:  1=normal, 2=streaming, 3=done
 */
export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  parts?: unknown;

  @IsOptional()
  metadata?: unknown;

  @IsOptional()
  @IsInt()
  status?: number;
}
