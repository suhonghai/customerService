#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — 服务器一键部署脚本(Ubuntu 24.04)
#
# 在服务器上跑这个脚本即可完成全部部署:
#   1. 前置检查(docker / 目录 / DNS)
#   2. docker load 5 个镜像
#   3. 第一次启动(mysql + chroma + backend + frontend + ai-cs-demo + nginx + certbot)
#   4. 等 backend ready → 申请 Let's Encrypt 证书(3 个域名)
#   5. 重启 nginx 加载证书
#   6. 健康检查 + 打印访问 URL
#   7. 安装 SSL 自动续期 cron(每天凌晨 3 点跑 certbot renew)
#
# 用法:
#   sudo bash deploy/scripts/install.sh
#
# 前置:
#   - 服务器已装 docker 24+ 和 docker compose plugin
#   - ubuntu 用户在 docker 组(或用 sudo 跑)
#   - 5 个镜像已 load 到 /opt/w11-erp/images/w11-erp-images.tar
#   - 项目部署文件已上传到 /opt/w11-erp/(compose + .env + 子包 .env + deploy/)
#   - 3 个子域名已 DNS 解析到服务器公网 IP
# =============================================================================

set -euo pipefail

# ============== 路径配置 ==============
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# install.sh 在 deploy/scripts/,项目根在 ../../
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
IMAGES_DIR="/opt/w11-erp/images"
IMAGES_TAR="$IMAGES_DIR/w11-erp-images.tar"
SSL_DIR="/opt/w11-erp/ssl"
CERTBOT_WEBROOT="/var/www/certbot"
LOG_DIR="/opt/w11-erp/logs"

# ============== 域名配置 ==============
PRIMARY_DOMAIN="suhai.cn"
APP_DOMAIN="app.suhai.cn"
CHAT_DOMAIN="chat.suhai.cn"
API_DOMAIN="api.suhai.cn"
ALL_DOMAINS=("$APP_DOMAIN" "$CHAT_DOMAIN" "$API_DOMAIN")

# ============== 颜色 ==============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { printf "${GREEN}[✓]${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
fail()  { printf "${RED}[✗]${NC} %s\n" "$*" >&2; exit 1; }
step()  { printf "\n${BLUE}===== %s =====${NC}\n" "$*"; }

# ============== 0. 前置检查 ==============
step "0. 前置检查"

# docker
if ! command -v docker >/dev/null 2>&1; then
  fail "docker 未安装,先跑: curl -fsSL https://get.docker.com | sh"
fi
if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose plugin 未安装"
fi
log "docker: $(docker --version) / compose: $(docker compose version --short)"

# 项目文件
[ -f "$PROJECT_ROOT/docker-compose.yml" ] || fail "找不到 $PROJECT_ROOT/docker-compose.yml"
[ -f "$PROJECT_ROOT/docker-compose.prod.yml" ] || fail "找不到 docker-compose.prod.yml"
[ -f "$PROJECT_ROOT/.env.production" ] || fail "找不到 .env.production"
log "项目文件齐全"

# 镜像 tar
if [ ! -f "$IMAGES_TAR" ]; then
  fail "找不到 $IMAGES_TAR,先把 5 个镜像 save + scp 到这里"
fi
log "镜像包: $(ls -lh $IMAGES_TAR | awk '{print $5}')"

# DNS 检查
for d in "${ALL_DOMAINS[@]}"; do
  RESOLVED=$(dig +short +time=5 +tries=1 "$d" @8.8.8.8 2>/dev/null | head -1)
  if [ -z "$RESOLVED" ]; then
    fail "DNS 解析失败: $d — 检查腾讯云控制台域名解析"
  fi
  log "DNS: $d → $RESOLVED"
done

# 公网 IP(用于 certbot 申请)
PUBLIC_IP=$(curl -s --max-time 8 ifconfig.me 2>/dev/null || curl -s --max-time 8 ip.sb 2>/dev/null)
[ -n "$PUBLIC_IP" ] || fail "无法获取公网 IP"
log "公网 IP: $PUBLIC_IP"

# 创建目录
mkdir -p "$SSL_DIR" "$CERTBOT_WEBROOT" "$LOG_DIR"
log "目录: SSL=$SSL_DIR, certbot webroot=$CERTBOT_WEBROOT, logs=$LOG_DIR"

# ============== 1. 加载镜像 ==============
step "1. 加载 5 个镜像"

cd "$IMAGES_DIR"
docker load -i w11-erp-images.tar
echo ""
echo "已加载镜像:"
docker images | grep -E 'w11-|mysql|chroma|certbot|nginx' | head -10

# ============== 2. 第一次启动(nginx 会因证书缺失启动失败,正常) ==============
step "2. 启动 mysql + chroma + backend + frontend + ai-cs-demo"

cd "$PROJECT_ROOT"
# --no-build:服务器没有源代码,直接用 load 进来的镜像(避免触发重新 build)
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -p w11-erp-prod \
  up -d --no-build --remove-orphans mysql chroma erp-admin-backend erp-admin-frontend ai-cs-demo

log "5 个核心服务已启动,等 backend ready 后申请证书"

# ============== 3. 等 backend healthy ==============
step "3. 等待 backend healthy(最长 120s)"

ready=0
for i in $(seq 1 24); do
  if docker exec w11-erp-prod-erp-admin-backend curl -fsS --max-time 3 http://127.0.0.1:3001/api/health/live >/dev/null 2>&1; then
    log "backend ready (用时 ${i}*5s)"
    ready=1
    break
  fi
  echo -n "."
  sleep 5
done
echo ""
[ "$ready" = "1" ] || fail "backend 5 分钟内未 ready,排查: docker logs w11-erp-prod-erp-admin-backend"

# 等 ai-cs-demo 也 ready(便于 chatbot 测试)
echo ""
echo "等 ai-cs-demo ready(最长 60s)..."
for i in $(seq 1 12); do
  if docker exec w11-erp-prod-ai-cs-demo curl -fsS --max-time 3 http://127.0.0.1:9529/ >/dev/null 2>&1; then
    log "ai-cs-demo ready (用时 ${i}*5s)"
    break
  fi
  echo -n "."
  sleep 5
done
echo ""

# ============== 4. 启动 nginx 接收 ACME challenge ==============
step "4. 启动 nginx(临时配置,仅 ACME challenge 走 80)"

# 第一次 nginx 会因为找不到证书 fail,这正常。我们让 nginx 跑起来,
# 用 certbot webroot 方式申请证书(不需要 nginx 443 通)
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -p w11-erp-prod \
  up -d --no-build nginx || warn "nginx 启动失败(预期:缺证书),先申请证书"

# 检查 80 是否通(ACME 关键)
echo "等 nginx 80 端口..."
for i in $(seq 1 10); do
  if curl -fsS --max-time 3 http://127.0.0.1:80/healthz >/dev/null 2>&1; then
    log "nginx 80 端口 OK"
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

# ============== 5. 申请 Let's Encrypt 证书 ==============
step "5. 申请 SSL 证书(3 个域名)"

# 检查证书是否已存在
if [ -d "$SSL_DIR/live/$APP_DOMAIN" ] && [ -f "$SSL_DIR/live/$APP_DOMAIN/fullchain.pem" ]; then
  log "证书已存在,跳过申请"
else
  DOMAIN_ARGS=""
  for d in "${ALL_DOMAINS[@]}"; do
    DOMAIN_ARGS="$DOMAIN_ARGS -d $d"
  done

  echo "申请证书:$DOMAIN_ARGS"
  echo "(certbot 会临时从 Let's Encrypt 80 端口验证域名归属)"
  echo ""

  docker run --rm \
    -v "$SSL_DIR:/etc/letsencrypt:rw" \
    -v "$CERTBOT_WEBROOT:/var/www/certbot:rw" \
    certbot/certbot:latest \
    certonly \
      --webroot \
      --webroot-path /var/www/certbot \
      --non-interactive \
      --agree-tos \
      --register-unsafely-without-email \
      --keep-until-expiring \
      $DOMAIN_ARGS

  log "证书申请成功"
fi

echo ""
echo "证书目录:"
ls -la "$SSL_DIR/live/" 2>&1
echo ""
echo "证书有效期:"
for d in "${ALL_DOMAINS[@]}"; do
  if [ -f "$SSL_DIR/live/$d/fullchain.pem" ]; then
    openssl x509 -in "$SSL_DIR/live/$d/fullchain.pem" -noout -dates 2>/dev/null | sed "s/^/  $d: /"
  fi
done

# ============== 6. 重启 nginx 加载证书 ==============
step "6. 重启 nginx"

cd "$PROJECT_ROOT"
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -p w11-erp-prod \
  up -d --no-build nginx

# 启动 certbot 常驻容器(用于后续 renew 时 sleep 86400)
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -p w11-erp-prod \
  up -d --no-build certbot

log "nginx + certbot 已就绪"

# 等 nginx 443 通
echo "等 nginx 443..."
for i in $(seq 1 10); do
  if curl -fkS --max-time 3 https://127.0.0.1/healthz >/dev/null 2>&1; then
    log "nginx 443 OK"
    break
  fi
  echo -n "."
  sleep 2
done
echo ""

# ============== 7. 配置 SSL 自动续期 ==============
step "7. 配置 SSL 自动续期(cron,每天凌晨 3 点跑)"

RENEW_SCRIPT="$DEPLOY_DIR/scripts/renew-ssl.sh"
if [ ! -f "$RENEW_SCRIPT" ]; then
  warn "renew-ssl.sh 不存在,跳过 cron 安装"
else
  chmod +x "$RENEW_SCRIPT"
  # 写 cron(每天 3:30 跑,避免和 certbot 自身轮询冲突)
  CRON_LINE="30 3 * * * $RENEW_SCRIPT >> $LOG_DIR/ssl-renew.log 2>&1"
  ( crontab -u ubuntu -l 2>/dev/null | grep -v 'renew-ssl' ; echo "$CRON_LINE" ) | crontab -u ubuntu -
  log "cron 已安装: $CRON_LINE"
  echo "查看: crontab -u ubuntu -l"
fi

# ============== 8. 健康检查 + 打印访问 URL ==============
step "8. 健康检查"

echo ""
echo "=== docker compose ps ==="
docker compose --env-file .env.production \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -p w11-erp-prod \
  ps
echo ""

echo "=== 关键端点检查 ==="
for url in \
  "https://$APP_DOMAIN/" \
  "https://$CHAT_DOMAIN/" \
  "https://$API_DOMAIN/api/health/live" \
  "https://$API_DOMAIN/api/health/ready"; do
  code=$(curl -k -o /dev/null -s -w "%{http_code}" --max-time 5 "$url" 2>&1 || echo "FAIL")
  printf "  %-50s → %s\n" "$url" "$code"
done

echo ""
echo "=== 容器日志最后 5 行(ai-cs-demo)==="
docker logs --tail 5 w11-erp-prod-ai-cs-demo 2>&1 | head -10

echo ""
step "✓ 部署完成"
echo ""
echo "🌐 访问入口:"
echo "  运营后台:    https://$APP_DOMAIN"
echo "  AI 客服:     https://$CHAT_DOMAIN"
echo "  后端 API:    https://$API_DOMAIN"
echo ""
echo "🔐 默认账号(来自 prisma seed):"
echo "  用户名: admin"
echo "  密  码: Admin@123"
echo "  (首次登录后立即改密码)"
echo ""
echo "📋 常用命令:"
echo "  查看日志:  cd /opt/w11-erp && docker compose -p w11-erp-prod logs -f"
echo "  重启服务:  cd /opt/w11-erp && docker compose -p w11-erp-prod restart <service>"
echo "  停止:      cd /opt/w11-erp && docker compose -p w11-erp-prod down"
echo "  更新镜像:  cd /opt/w11-erp && deploy/scripts/update.sh"
echo ""
echo "📝 证书续期日志: tail -f $LOG_DIR/ssl-renew.log"