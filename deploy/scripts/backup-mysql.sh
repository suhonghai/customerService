#!/bin/bash
# MySQL 备份,7 天轮转
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/data/backup/mysql
KEEP_DAYS=7
MYSQL_PWD="${MYSQL_PWD:?请 export MYSQL_PWD=root-password}"

mkdir -p $BACKUP_DIR

mysqldump -u root \
  --single-transaction --quick --routines --triggers --events \
  --default-character-set=utf8mb4 \
  erp | gzip > $BACKUP_DIR/erp_${DATE}.sql.gz

DELETED=$(find $BACKUP_DIR -name "erp_*.sql.gz" -mtime +$KEEP_DAYS -delete -print | wc -l)

# 上传 COS(可选)
# coscmd upload $BACKUP_DIR/erp_${DATE}.sql.gz cos://your-bucket/db-backup/

echo "[$(date)] MySQL backup OK: erp_${DATE}.sql.gz (cleaned $DELETED old)" >> /data/logs/backup.log
