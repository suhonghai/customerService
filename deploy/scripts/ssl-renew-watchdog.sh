#!/bin/bash
# SSL 过期检查
CERT_PATH=/etc/letsencrypt/live/erp.yourdomain.com/cert.pem
DAYS_LEFT=$(openssl x509 -enddate -noout -in $CERT_PATH | cut -d= -f2 | xargs -I{} date -d "{}" +%s)
DAYS_LEFT=$(( (DAYS_LEFT - $(date +%s)) / 86400 ))

if [ "$DAYS_LEFT" -lt 14 ]; then
  bash /home/deploy/deploy/scripts/alert.sh "⚠️ SSL cert expires in $DAYS_LEFT days"
fi
