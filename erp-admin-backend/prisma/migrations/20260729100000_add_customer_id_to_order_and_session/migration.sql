-- W11:Order 加 customer_id 列 + cs_session 加 customer_id 列,区分 C 端 CsCustomer 和内部 User
-- 修 listOrdersBySession 把 CsCustomer.id 误当成 User.id 过滤的架构 bug

-- AlterTable
ALTER TABLE `order` ADD COLUMN `customer_id` INT NULL;

-- AlterTable
ALTER TABLE `cs_session` ADD COLUMN `customer_id` INT NULL;

-- CreateIndex (order)
CREATE INDEX `order_customer_id_idx` ON `order`(`customer_id`);

-- CreateIndex (cs_session)
CREATE INDEX `cs_session_customer_id_idx` ON `cs_session`(`customer_id`);

-- AddForeignKey (order.customer_id -> cs_customer.id)
-- 注:cs_customer 表已存在;Prisma 后续 db push 会自动管理这个 FK
-- 这里先不加 FK 约束,避免历史脏数据导致迁移失败;运行时靠 service 层校验