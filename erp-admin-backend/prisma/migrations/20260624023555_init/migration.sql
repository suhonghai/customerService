-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(200) NOT NULL,
    `nickname` VARCHAR(50) NULL,
    `email` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `avatar` VARCHAR(500) NULL,
    `department_id` INTEGER NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(50) NULL,
    `password_expired_at` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `user_username_key`(`username`),
    UNIQUE INDEX `user_email_key`(`email`),
    INDEX `user_username_idx`(`username`),
    INDEX `user_department_id_idx`(`department_id`),
    INDEX `user_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` VARCHAR(200) NULL,
    `data_scope` INTEGER NOT NULL DEFAULT 1,
    `custom_dept_ids` TEXT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `builtin` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `role_code_key`(`code`),
    INDEX `role_code_idx`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role` (
    `user_id` INTEGER NOT NULL,
    `role_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_role_role_id_idx`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parent_id` INTEGER NULL,
    `name` VARCHAR(50) NOT NULL,
    `path` VARCHAR(200) NULL,
    `component` VARCHAR(200) NULL,
    `icon` VARCHAR(50) NULL,
    `type` INTEGER NOT NULL,
    `perm_code` VARCHAR(100) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `status` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `menu_parent_id_idx`(`parent_id`),
    INDEX `menu_type_idx`(`type`),
    INDEX `menu_perm_code_idx`(`perm_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_menu` (
    `role_id` INTEGER NOT NULL,
    `menu_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `role_menu_menu_id_idx`(`menu_id`),
    PRIMARY KEY (`role_id`, `menu_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cs_session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_key` VARCHAR(100) NOT NULL,
    `user_id` INTEGER NULL,
    `visitor_id` VARCHAR(100) NOT NULL,
    `visitor_name` VARCHAR(50) NULL,
    `channel` INTEGER NOT NULL DEFAULT 1,
    `status` INTEGER NOT NULL DEFAULT 1,
    `ai_model_code` VARCHAR(50) NULL,
    `message_count` INTEGER NOT NULL DEFAULT 0,
    `rating` INTEGER NULL,
    `rating_text` TEXT NULL,
    `escalated_at` DATETIME(3) NULL,
    `ended_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cs_session_session_key_key`(`session_key`),
    INDEX `cs_session_user_id_idx`(`user_id`),
    INDEX `cs_session_visitor_id_idx`(`visitor_id`),
    INDEX `cs_session_status_idx`(`status`),
    INDEX `cs_session_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cs_message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `session_id` INTEGER NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `content` TEXT NOT NULL,
    `parts` JSON NULL,
    `metadata` JSON NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `user_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cs_message_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cs_ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_no` VARCHAR(30) NOT NULL,
    `session_id` INTEGER NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 2,
    `status` INTEGER NOT NULL DEFAULT 1,
    `category` VARCHAR(50) NULL,
    `creator_id` INTEGER NOT NULL,
    `assignee_id` INTEGER NULL,
    `related_order_id` INTEGER NULL,
    `sla_deadline` DATETIME(3) NULL,
    `resolved_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `cs_ticket_ticket_no_key`(`ticket_no`),
    INDEX `cs_ticket_ticket_no_idx`(`ticket_no`),
    INDEX `cs_ticket_status_idx`(`status`),
    INDEX `cs_ticket_assignee_id_idx`(`assignee_id`),
    INDEX `cs_ticket_creator_id_idx`(`creator_id`),
    INDEX `cs_ticket_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cs_ticket_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticket_id` INTEGER NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `from_val` VARCHAR(200) NULL,
    `to_val` VARCHAR(200) NULL,
    `comment` TEXT NULL,
    `operator_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cs_ticket_log_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(30) NOT NULL,
    `user_id` INTEGER NULL,
    `customer_name` VARCHAR(50) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_email` VARCHAR(100) NULL,
    `total_amount` DECIMAL(10, 2) NOT NULL,
    `pay_amount` DECIMAL(10, 2) NOT NULL,
    `pay_method` VARCHAR(20) NULL,
    `pay_status` INTEGER NOT NULL DEFAULT 1,
    `order_status` INTEGER NOT NULL DEFAULT 1,
    `ship_no` VARCHAR(50) NULL,
    `ship_company` VARCHAR(50) NULL,
    `address` TEXT NULL,
    `remark` TEXT NULL,
    `paid_at` DATETIME(3) NULL,
    `shipped_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `refund_amount` DECIMAL(10, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `order_order_no_key`(`order_no`),
    INDEX `order_order_no_idx`(`order_no`),
    INDEX `order_customer_phone_idx`(`customer_phone`),
    INDEX `order_order_status_pay_status_idx`(`order_status`, `pay_status`),
    INDEX `order_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `product_id` VARCHAR(50) NOT NULL,
    `product_name` VARCHAR(200) NOT NULL,
    `product_sku` VARCHAR(100) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_item_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_model_config` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `provider` VARCHAR(50) NOT NULL,
    `model_id` VARCHAR(100) NOT NULL,
    `api_key` VARCHAR(500) NULL,
    `base_url` VARCHAR(200) NULL,
    `temperature` DOUBLE NOT NULL DEFAULT 0.7,
    `top_p` DOUBLE NOT NULL DEFAULT 0.8,
    `max_tokens` INTEGER NOT NULL DEFAULT 2000,
    `system_prompt` TEXT NULL,
    `description` TEXT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `status` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `ai_model_config_code_key`(`code`),
    INDEX `ai_model_config_code_idx`(`code`),
    INDEX `ai_model_config_is_default_idx`(`is_default`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_prompt_template` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `variables` TEXT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `ai_prompt_template_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faq_document` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(200) NOT NULL,
    `category` VARCHAR(50) NULL,
    `tags` VARCHAR(200) NULL,
    `current_version` INTEGER NOT NULL DEFAULT 1,
    `status` INTEGER NOT NULL DEFAULT 1,
    `uploader_id` INTEGER NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `faq_document_category_idx`(`category`),
    INDEX `faq_document_status_idx`(`status`),
    INDEX `faq_document_uploader_id_idx`(`uploader_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `faq_version` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_id` INTEGER NOT NULL,
    `version` INTEGER NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `chunk_count` INTEGER NOT NULL DEFAULT 0,
    `changelog` TEXT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `reviewer_id` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `faq_version_checksum_idx`(`checksum`),
    INDEX `faq_version_status_idx`(`status`),
    UNIQUE INDEX `faq_version_document_id_version_key`(`document_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `username` VARCHAR(50) NULL,
    `module` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `resource` VARCHAR(100) NULL,
    `resource_id` VARCHAR(50) NULL,
    `method` VARCHAR(10) NULL,
    `path` VARCHAR(200) NULL,
    `params` JSON NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `ip` VARCHAR(50) NULL,
    `user_agent` VARCHAR(500) NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `error_msg` TEXT NULL,
    `cost_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `audit_log_module_action_idx`(`module`, `action`),
    INDEX `audit_log_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dict_type` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `remark` VARCHAR(200) NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dict_type_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dict_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type_id` INTEGER NOT NULL,
    `label` VARCHAR(100) NOT NULL,
    `value` VARCHAR(100) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` INTEGER NOT NULL DEFAULT 1,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `css_class` VARCHAR(50) NULL,
    `remark` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dict_item_type_id_sort_idx`(`type_id`, `sort`),
    UNIQUE INDEX `dict_item_type_id_value_key`(`type_id`, `value`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_meta` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `original_name` VARCHAR(200) NOT NULL,
    `storage_path` VARCHAR(500) NOT NULL,
    `storage_type` VARCHAR(20) NOT NULL DEFAULT 'local',
    `url` VARCHAR(500) NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `uploader_id` INTEGER NULL,
    `business_type` VARCHAR(50) NULL,
    `business_id` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `file_meta_business_type_business_id_idx`(`business_type`, `business_id`),
    INDEX `file_meta_checksum_idx`(`checksum`),
    INDEX `file_meta_uploader_id_idx`(`uploader_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu` ADD CONSTRAINT `menu_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `menu`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_menu` ADD CONSTRAINT `role_menu_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_menu` ADD CONSTRAINT `role_menu_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `menu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_session` ADD CONSTRAINT `cs_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_message` ADD CONSTRAINT `cs_message_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `cs_session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_message` ADD CONSTRAINT `cs_message_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_ticket` ADD CONSTRAINT `cs_ticket_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `cs_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_ticket` ADD CONSTRAINT `cs_ticket_creator_id_fkey` FOREIGN KEY (`creator_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_ticket` ADD CONSTRAINT `cs_ticket_assignee_id_fkey` FOREIGN KEY (`assignee_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cs_ticket_log` ADD CONSTRAINT `cs_ticket_log_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `cs_ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faq_document` ADD CONSTRAINT `faq_document_uploader_id_fkey` FOREIGN KEY (`uploader_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faq_version` ADD CONSTRAINT `faq_version_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `faq_document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `faq_version` ADD CONSTRAINT `faq_version_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dict_item` ADD CONSTRAINT `dict_item_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `dict_type`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
