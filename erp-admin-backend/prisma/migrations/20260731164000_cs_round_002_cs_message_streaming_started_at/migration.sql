-- cs-round-002:placeholder reaper 需要的 cs_message 字段
-- 之前 cs-round-001 设计时 schema 改动没进 main,这里补上

ALTER TABLE `cs_message`
  ADD COLUMN `streaming_started_at` DATETIME(3) NULL,
  ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- reaper 高效扫陈旧 status=2 行
CREATE INDEX `cs_message_status_updated_at_idx` ON `cs_message`(`status`, `updated_at`);
