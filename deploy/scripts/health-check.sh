#!/bin/bash
# 健康检查 + 报警(crontab 每 5 分钟跑一次)
# 用法:ENV=production BACKEND_PUBLIC_URL=https://erp.example.com FRONTEND_PUBLIC_URL=https://web.example.com AI_CS_PUBLIC_URL=https://cs.example.com ./health-check.sh

ALERT_SCRIPT="${ALERT_SCRIPT:-$(cd "$(dirname "$0")" && pwd)/alert.sh}"
ENV="${ENV:-production}"
BACKEND_PUBLIC_URL="${BACKEND_PUBLIC_URL:-http://localhost:3000}"
FRONTEND_PUBLIC_URL="${FRONTEND_PUBLIC_URL:-http://localhost:8080}"
AI_CS_PUBLIC_URL="${AI_CS_PUBLIC_URL:-http://localhost:9529}"

check_endpoint() {
  local URL="$1"
  local DESC="$2"
  local HTTP_CODE
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo "000")
  if [ "$HTTP_CODE" != "200" ]; then
    bash "$ALERT_SCRIPT" "🚨 Health check $DESC ($URL) returned $HTTP_CODE"
    return 1
  fi
  echo "  [OK] $DESC ($URL) -> $HTTP_CODE"
  return 0
}

echo "=== Health check (env=$ENV) ==="

# 1. HTTP 健康检查
check_endpoint "${BACKEND_PUBLIC_URL}/api/health" "backend"
check_endpoint "${FRONTEND_PUBLIC_URL}/" "frontend"
check_endpoint "${AI_CS_PUBLIC_URL}/" "ai-cs-demo homepage"

# 2. Docker 容器状态(若本机有 docker)
if command -v docker >/dev/null 2>&1; then
  for SERVICE in erp-admin-backend erp-admin-frontend ai-cs-demo; do
    CONTAINER="w11-erp-${ENV}-${SERVICE}"
    STATE=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    if [ "$STATE" != "running" ]; then
      bash "$ALERT_SCRIPT" "🚨 Container $CONTAINER is $STATE"
    else
      echo "  [OK] container $CONTAINER running"
    fi
  done
fi

# 3. 磁盘
DISK_USAGE=$(df /data 2>/dev/null | tail -1 | awk '{print $5}' | sed 's/%//' || echo "0")
if [ -n "$DISK_USAGE" ] && [ "$DISK_USAGE" -gt 80 ]; then
  bash "$ALERT_SCRIPT" "⚠️ Disk usage ${DISK_USAGE}% > 80%"
fi

# 4. 内存
MEM_USAGE=$(free 2>/dev/null | grep Mem | awk '{printf "%.0f", $3/$2 * 100}' || echo "0")
if [ -n "$MEM_USAGE" ] && [ "$MEM_USAGE" -gt 85 ]; then
  bash "$ALERT_SCRIPT" "⚠️ Memory usage ${MEM_USAGE}% > 85%"
fi

# 5. SSL 过期(若证书存在)
CERT_PATH="/etc/letsencrypt/live/erp.yourdomain.com/cert.pem"
if [ -f "$CERT_PATH" ]; then
  CERT_EXPIRE=$(openssl x509 -enddate -noout -in "$CERT_PATH" | cut -d= -f2)
  DAYS_LEFT=$(( ( $(date -d "$CERT_EXPIRE" +%s) - $(date +%s) ) / 86400 ))
  if [ "$DAYS_LEFT" -lt 14 ]; then
    bash "$ALERT_SCRIPT" "⚠️ SSL cert expires in $DAYS_LEFT days"
  fi
fi

mkdir -p /data/logs 2>/dev/null || true
echo "[$(date)] Health check OK" >> /data/logs/health-check.log 2>/dev/null || true
echo "=== Health check done ==="
