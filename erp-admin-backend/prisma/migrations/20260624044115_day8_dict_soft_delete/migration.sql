-- AlterTable
ALTER TABLE `dict_item` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `dict_type` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `dict_item_deleted_at_idx` ON `dict_item`(`deleted_at`);

-- CreateIndex
CREATE INDEX `dict_type_deleted_at_idx` ON `dict_type`(`deleted_at`);
