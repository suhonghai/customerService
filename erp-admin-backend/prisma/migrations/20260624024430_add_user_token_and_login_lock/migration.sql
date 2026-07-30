-- AlterTable
ALTER TABLE `user` ADD COLUMN `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `locked_until` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `user_token` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `jti` VARCHAR(64) NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'refresh',
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(50) NULL,
    `user_agent` VARCHAR(500) NULL,

    UNIQUE INDEX `user_token_jti_key`(`jti`),
    INDEX `user_token_user_id_idx`(`user_id`),
    INDEX `user_token_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_token` ADD CONSTRAINT `user_token_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
