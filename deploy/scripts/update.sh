#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — 服务器端更新脚本(被 mac 端 iterate.sh 远程触发)
#
# 这个脚本假设文件已经通过 rsync 同步好了,服务器只负责:
#   1. 检测哪些服务代码变了 → 重新 build
#   2. 重启对应服务
#   3. 检测 nginx 配置变了 → reload
#   4. 检测 prisma schema 变了 → migrate deploy
#
# 不在服务器跑 git pull —— 网络不稳 + 服务器不需要知道 git 历史
#
# 用法(在服务器上跑,或通过 ssh 远程触发):
#   cd /opt/w11-erp && bash deploy/scripts/update.sh
#   cd /opt/w11-erp && bash deploy/scripts/update.sh erp-admin-backend
#   cd /opt/w11-erp && bash deploy/scripts/update.sh --migrate
#
# ⚠️  永远不要在服务器跑 prisma migrate reset / db push --force-reset
# =============================================================================

set -euo pipefail

# ============== 路径 ==============
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

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

cd "$PROJECT_ROOT"

command -v docker >/dev/null 2>&1 || fail "docker 未安装"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin 未安装"

# 备份当前镜像(用作回滚保险)
BACKUP_DIR="/opt/w11-erp/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# ============== 1. 解析参数 ==============
MIGRATE=0
RELOAD_ONLY=0
SERVICES=()
for arg in "$@"; do
  case "$arg" in
    --migrate)     MIGRATE=1 ;;
    --reload-only) RELOAD_ONLY=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *) SERVICES+=("$arg") ;;
  esac
done

# ============== 2. 检测要 build 哪些服务 ==============
step "1. 检测变更"

# 跟踪每个服务的 mtime(文件刚刚 rsync 过来,mtime 是新值)
NEED_BUILD=()
SELF_BUILD_SERVICES=(erp-admin-backend erp-admin-frontend ai-cs-demo)

# nginx conf → reload
NEED_RELOAD=0
NGINX_CONF="deploy/nginx/prod.conf"
# 没法 git diff(服务器没 git),靠 mtime 对比 last deploy marker
LAST_DEPLOY_MARKER="/opt/w11-erp/.last_deploy"
if [ -f "$LAST_DEPLOY_MARKER" ]; then
  if [ "$NGINX_CONF" -nt "$LAST_DEPLOY_MARKER" ]; then
    NEED_RELOAD=1
    warn "nginx 配置 mtime 新于上次部署 → 将 reload"
  fi
else
  # 首次跑,nginx 配了跟容器一起 up,先不动
  log "首次部署,跳过 nginx reload 检测"
fi

# 各服务代码变更
for svc in "${SELF_BUILD_SERVICES[@]}"; do
  # 简单粗暴:rsync 后整个 svc 目录 mtime 都更新;用文件存在 + src 文件修改时间判断
  # 更稳:维护一个 .last_build_<svc> marker
  LAST_BUILD="/opt/w11-erp/.last_build_${svc//\//_}"
  if [ -f "$LAST_BUILD" ]; then
    # 检查 svc 目录里有没有比 marker 新的文件
    if find "$svc" -type f -newer "$LAST_BUILD" -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' 2>/dev/null | head -1 | grep -q .; then
      NEED_BUILD+=("$svc")
      log "$svc 有代码改动 → 将 rebuild"
    fi
  else
    # 首次 build
    NEED_BUILD+=("$svc")
    log "$svc 未 build 过 → 将 build"
  fi
done

# prisma schema → migrate
NEED_MIGRATE=0
PRISMA_SCHEMA="erp-admin-backend/prisma/schema.prisma"
LAST_MIGRATE="/opt/w11-erp/.last_migrate"
if [ -f "$LAST_MIGRATE" ]; then
  if [ "$PRISMA_SCHEMA" -nt "$LAST_MIGRATE" ]; then
    NEED_MIGRATE=1
    warn "Prisma schema mtime 新于上次 migrate → 将跑 migrate deploy"
  fi
else
  # 首次跑,可能需要初始 migrate
  NEED_MIGRATE=1
  log "首次检测,跑一次 migrate deploy(确保 schema 同步)"
fi

# 用户显式传 service,覆盖自动判断
if [ "${#SERVICES[@]}" -gt 0 ]; then
  log "用户指定服务: ${SERVICES[*]}"
  NEED_BUILD=("${SERVICES[@]}")
fi

if [ "$MIGRATE" = "1" ]; then
  NEED_MIGRATE=1
fi

if [ "$RELOAD_ONLY" = "1" ]; then
  NEED_BUILD=()
fi

# ============== 3. 备份当前镜像(回滚保险) ==============
step "2. 备份当前镜像(回滚保险)"

for svc in "${NEED_BUILD[@]}"; do
  IMAGE="w11-${svc}:production"
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    SAFE_NAME=$(echo "$svc" | tr '/' '_')
    docker save "$IMAGE" -o "$BACKUP_DIR/${SAFE_NAME}.tar" 2>&1 | tail -1
    log "已备份镜像: $IMAGE → $BACKUP_DIR/${SAFE_NAME}.tar"
  fi
done

# 清理 7 天前的旧备份(简单策略:超过 5 个就删最老的)
BACKUP_COUNT=$(ls -1d /opt/w11-erp/backups/*/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 5 ]; then
  ls -1dt /opt/w11-erp/backups/*/ | tail -n +6 | xargs rm -rf
  log "已清理 $((BACKUP_COUNT - 5)) 个旧备份"
fi

# ============== 4. prisma migrate deploy ==============
if [ "$NEED_MIGRATE" = "1" ]; then
  step "3. prisma migrate deploy"

  if ! docker ps --format '{{.Names}}' | grep -q 'w11-erp-prod-erp-admin-backend'; then
    fail "backend 容器未运行,先 up 它再 migrate"
  fi

  docker compose --env-file .env.production \
    -f docker-compose.yml -f docker-compose.prod.yml \
    -p w11-erp-prod \
    exec erp-admin-backend \
    npx prisma migrate deploy 2>&1 | tail -20

  touch "$LAST_MIGRATE"
  log "migrate deploy 完成"
fi

# ============== 5. docker compose build ==============
if [ "${#NEED_BUILD[@]}" -gt 0 ]; then
  step "4. docker compose build ${NEED_BUILD[*]}"

  docker compose --env-file .env.production \
    -f docker-compose.yml -f docker-compose.prod.yml \
    -p w11-erp-prod \
    build "${NEED_BUILD[@]}"

  log "build 完成"

  # 更新 marker
  for svc in "${NEED_BUILD[@]}"; do
    LAST_BUILD="/opt/w11-erp/.last_build_${svc//\//_}"
    touch "$LAST_BUILD"
  done
fi

# ============== 6. restart ==============
if [ "${#NEED_BUILD[@]}" -gt 0 ]; then
  step "5. up -d --no-build --no-deps ${NEED_BUILD[*]}"

  docker compose --env-file .env.production \
    -f docker-compose.yml -f docker-compose.prod.yml \
    -p w11-erp-prod \
    up -d --no-build --no-deps "${NEED_BUILD[@]}"

  log "${NEED_BUILD[*]} 已重启"
fi

# ============== 7. nginx reload ==============
if [ "$NEED_RELOAD" = "1" ]; then
  step "6. nginx -s reload"

  if docker ps --format '{{.Names}}' | grep -q 'w11-erp-prod-nginx'; then
    docker exec w11-erp-prod-nginx nginx -t && \
      docker exec w11-erp-prod-nginx nginx -s reload
    log "nginx 已 reload(零停机)"
    touch "$LAST_DEPLOY_MARKER"
  else
    warn "nginx 容器未运行,跳过 reload"
  fi
else
  # 即使这次没 reload,也更新 marker(让下次能正确对比)
  touch "$LAST_DEPLOY_MARKER"
fi

# ============== 8. 健康检查 ==============
step "7. 健康检查"

sleep 3
echo ""
echo "=== 容器状态 ==="
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -p w11-erp-prod \
  ps
echo ""

echo "=== 关键端点 ==="
for url in \
  "https://app.suhhai.cn/" \
  "https://chat.suhhai.cn/" \
  "https://api.suhhai.cn/api/health/live" \
  "https://api.suhhai.cn/api/health/ready"; do
  code=$(curl -k -o /dev/null -s -w "%{http_code}" --max-time 5 "$url" 2>&1 || echo "FAIL")
  printf "  %-50s → %s\n" "$url" "$code"
done

step "✓ 更新完成"
echo ""
echo "📋 常用命令:"
echo "  看日志:    docker compose -p w11-erp-prod logs -f --tail=50 <service>"
echo "  回滚镜像:  ls /opt/w11-erp/backups/  (按需 docker load + up -d)"
echo "  重启服务:  docker compose -p w11-erp-prod restart <service>"
echo ""