#!/bin/bash
# /data/uploads + /data/chroma 备份
set -e

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/data/backup/files
KEEP_DAYS=30

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/all_${DATE}.tar.gz /data/uploads/ /data/chroma-data/ 2>/dev/null

find $BACKUP_DIR -name "all_*.tar.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] Files backup OK: all_${DATE}.tar.gz" >> /data/logs/backup.log
