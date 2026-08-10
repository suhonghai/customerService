import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH /api/internal/cs/sessions/:id/messages/:msgId/rating — 消息评分
 *
 * cs-round-043:用户点 AI 消息下方 👍/👎 → 落 csMessage.metadata.rating
 *   rating=1  👍 useful
 *   rating=-1 👎 not useful
 *   ratingText 可选 — 后续可加 UI 文评
 */
export class RateMessageDto {
  @IsIn([1, -1])
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ratingText?: string;
}
