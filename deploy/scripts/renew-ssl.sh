#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — SSL 证书自动续期脚本
# 由 install.sh 装到 cron(每天 3:30 跑一次)
# certbot --keep-until-expiring 策略:证书到期 < 30 天时才真正续期
# 续期成功后 reload nginx(不需要重启容器)
# =============================================================================

set -euo pipefail

PROJECT_ROOT="/opt/w11-erp"
SSL_DIR="/opt/w11-erp/ssl"
CERTBOT_WEBROOT="/var/www/certbot"
LOG_TAG="[renew-ssl]"

# app/chat/api 三者共用一张 app.suhhai.cn 证书(SAN 覆盖);suhhai.cn 裸域是独立一张证书,
# 必须单独列入,否则裸域续了也不会触发 nginx reload
DOMAINS=("app.suhhai.cn" "chat.suhhai.cn" "api.suhhai.cn" "suhhai.cn")

log()  { printf '%s %s %s\n' "$(date '+%F %T')" "$LOG_TAG" "$*"; }
warn() { printf '%s %s WARN: %s\n' "$(date '+%F %T')" "$LOG_TAG" "$*" >&2; }
# fail 会以非 0 退出,让 cron 行的 `|| logger -t ssl-renew 'SSL renew FAILED'` 触发告警
fail() { printf '%s %s ERROR: %s\n' "$(date '+%F %T')" "$LOG_TAG" "$*" >&2; exit 1; }

log "开始 SSL 续期检查"

# 检查 certbot 容器在不在(被 install.sh 装了常驻容器)
# 注意:续期走的是下面的 `docker run --rm`,不依赖常驻容器,所以这里只 warn 不中断
if ! docker ps --format '{{.Names}}' | grep -q 'certbot'; then
  warn "certbot 常驻容器未运行(不影响下面的 docker run 续期)"
fi

# 跑 certbot renew(对所有证书)
if ! docker run --rm \
    -v "$SSL_DIR:/etc/letsencrypt:rw" \
    -v "$CERTBOT_WEBROOT:/var/www/certbot:rw" \
    certbot/certbot:latest \
    renew --quiet --webroot --webroot-path /var/www/certbot; then
  fail "certbot renew 失败,查看上面输出"
fi

# 检查证书是否真的更新了(对比 mtime)
RENEWED=0
for d in "${DOMAINS[@]}"; do
  CERT="$SSL_DIR/live/$d/fullchain.pem"
  if [ ! -f "$CERT" ]; then
    log "[WARN] $d 证书文件不存在"
    continue
  fi
  MTIME=$(stat -c %Y "$CERT" 2>/dev/null || stat -f %m "$CERT")
  NOW=$(date +%s)
  AGE=$((NOW - MTIME))
  # 如果证书文件在过去 1 小时内被更新,说明真的续了
  if [ "$AGE" -lt 3600 ]; then
    log "证书已续期: $d (age=${AGE}s)"
    RENEWED=1
  fi
done

# reload nginx(零停机)
if [ "$RENEWED" = "1" ]; then
  if docker ps --format '{{.Names}}' | grep -q 'nginx'; then
    if docker exec w11-erp-prod-nginx nginx -s reload 2>/dev/null; then
      log "nginx 已 reload"
    else
      # 证书已换但 nginx 还在用旧证书,属于真失败,非 0 退出触发 cron 告警
      fail "nginx reload 失败,需要手动检查"
    fi
  fi
fi

log "SSL 续期检查完成(renewed=$RENEWED)"