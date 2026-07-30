#!/bin/bash
# MySQL 恢复(从 .sql.gz)
set -e

BACKUP_FILE="${1:?用法: ./restore-mysql.sh /data/backup/mysql/erp_xxx.sql.gz}"

echo "=== 警告:将覆盖当前 erp 库的所有数据 ==="
read -p "确认继续?(yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "已取消"
  exit 1
fi

# 备份当前(以防回滚)
mysqldump -u root erp | gzip > /tmp/before-restore-$(date +%s).sql.gz

# 重建
mysql -u root -e "DROP DATABASE IF EXISTS erp;"
mysql -u root -e "CREATE DATABASE erp DEFAULT CHARACTER SET utf8mb4;"
mysql -u root -e "GRANT ALL ON erp.* TO 'erp_admin'@'localhost';"

# 导入
gunzip -c $BACKUP_FILE | mysql -u root erp

echo "=== 恢复完成 ==="
mysql -u root erp -e "SHOW TABLES; SELECT COUNT(*) AS user_count FROM user;"
