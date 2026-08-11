-- ai_model_config 加 embed_model 字段
-- 让 EmbeddingService 从 DB 读向量模型名(可选),DB 为空时 fallback env EMBED_MODEL。
-- 跟着 Prisma client 的 @map("embed_model") 命名。
ALTER TABLE `ai_model_config`
  ADD COLUMN `embed_model` VARCHAR(100) NULL AFTER `model_id`;