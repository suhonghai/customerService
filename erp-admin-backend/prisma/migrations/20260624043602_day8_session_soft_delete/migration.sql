-- AlterTable
ALTER TABLE `cs_session` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `cs_session_deleted_at_idx` ON `cs_session`(`deleted_at`);
