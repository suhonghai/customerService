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
# 用 hash 对比,不用 mtime(rsync 会刷新所有 mtime)
NEED_RELOAD=0
NGINX_CONF="deploy/nginx/prod.conf"
LAST_DEPLOY_MARKER="/opt/w11-erp/.last_deploy"
CURRENT_NGINX_HASH=$(sha256sum "$NGINX_CONF" 2>/dev/null | cut -c1-32)
if [ -f "$LAST_DEPLOY_MARKER" ]; then
  LAST_NGINX_HASH=$(cat "$LAST_DEPLOY_MARKER" 2>/dev/null || echo "")
  if [ "$CURRENT_NGINX_HASH" != "$LAST_NGINX_HASH" ] && [ -n "$CURRENT_NGINX_HASH" ]; then
    NEED_RELOAD=1
    warn "nginx 配置变了($LAST_NGINX_HASH → $CURRENT_NGINX_HASH)→ 将 reload"
  fi
else
  log "首次部署,初始化 nginx marker(不 reload)"
  echo "$CURRENT_NGINX_HASH" > "$LAST_DEPLOY_MARKER"
fi

# 各服务代码变更
# 用 hash 而非 mtime 判断:rsync 后所有 mtime 都被刷新,会全部误判为"改动"。
# 把每次成功 build 的文件指纹存到 marker,下次对比。
NEED_FIRST_INIT=0
for svc in "${SELF_BUILD_SERVICES[@]}"; do
  LAST_BUILD="/opt/w11-erp/.last_build_${svc//\//_}"
  # 首次跑(没 marker):不重建,只初始化 marker
  if [ ! -f "$LAST_BUILD" ]; then
    NEED_FIRST_INIT=1
    log "$svc 无 marker,首次跑 → 初始化 marker(不重建)"
    continue
  fi
  # 用排除规则计算 svc 目录的指纹(排除掉构建产物)
  CURRENT_HASH=$(find "$svc" -type f \
    -not -path '*/node_modules/*' \
    -not -path '*/.next/*' \
    -not -path '*/dist/*' \
    -not -path '*/.turbo/*' \
    -not -name '*.tsbuildinfo' \
    -not -path '*/coverage/*' \
    2>/dev/null | sort | xargs sha256sum 2>/dev/null | sha256sum | cut -c1-32)
  if [ -z "$CURRENT_HASH" ]; then
    warn "$svc 指纹计算失败,跳过(可能是空目录)"
    continue
  fi
  LAST_HASH=$(cat "$LAST_BUILD" 2>/dev/null || echo "")
  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    NEED_BUILD+=("$svc")
    log "$svc 代码指纹变了($LAST_HASH → $CURRENT_HASH)→ 将 rebuild"
  fi
done

# 首次初始化:扫一遍所有服务,把当前 hash 写进 marker
if [ "$NEED_FIRST_INIT" = "1" ]; then
  step "1.5 首次初始化 marker(跳过 build)"
  for svc in "${SELF_BUILD_SERVICES[@]}"; do
    LAST_BUILD="/opt/w11-erp/.last_build_${svc//\//_}"
    if [ ! -f "$LAST_BUILD" ]; then
      HASH=$(find "$svc" -type f \
        -not -path '*/node_modules/*' \
        -not -path '*/.next/*' \
        -not -path '*/dist/*' \
        -not -path '*/.turbo/*' \
        -not -name '*.tsbuildinfo' \
        -not -path '*/coverage/*' \
        2>/dev/null | sort | xargs sha256sum 2>/dev/null | sha256sum | cut -c1-32)
      if [ -n "$HASH" ]; then
        echo "$HASH" > "$LAST_BUILD"
        log "已初始化 marker: $svc → $HASH"
      fi
    fi
  done
  # 首次初始化时,如果用户没指定 service,就不 build
  if [ "${#SERVICES[@]}" -eq 0 ] && [ "$RELOAD_ONLY" != "1" ]; then
    log "首次跑完成初始化,不做 build。需要重建请显式指定: update.sh <service>"
    SERVICES=()
    NEED_BUILD=()
  fi
fi

# prisma schema → migrate
# 用 hash 对比
NEED_MIGRATE=0
PRISMA_SCHEMA="erp-admin-backend/prisma/schema.prisma"
LAST_MIGRATE="/opt/w11-erp/.last_migrate"
CURRENT_SCHEMA_HASH=$(sha256sum "$PRISMA_SCHEMA" 2>/dev/null | cut -c1-32)
if [ -f "$LAST_MIGRATE" ]; then
  LAST_SCHEMA_HASH=$(cat "$LAST_MIGRATE" 2>/dev/null || echo "")
  if [ "$CURRENT_SCHEMA_HASH" != "$LAST_SCHEMA_HASH" ] && [ -n "$CURRENT_SCHEMA_HASH" ]; then
    NEED_MIGRATE=1
    warn "Prisma schema 变了($LAST_SCHEMA_HASH → $CURRENT_SCHEMA_HASH)→ 将跑 migrate deploy"
  fi
else
  log "首次检测,初始化 schema marker(不跑 migrate)"
  echo "$CURRENT_SCHEMA_HASH" > "$LAST_MIGRATE"
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
  echo "$CURRENT_SCHEMA_HASH" > "$LAST_MIGRATE"
fi

# ============== 5. docker compose build ==============
if [ "${#NEED_BUILD[@]}" -gt 0 ]; then
  step "4. docker compose build ${NEED_BUILD[*]}"

  docker compose --env-file .env.production \
    -f docker-compose.yml -f docker-compose.prod.yml \
    -p w11-erp-prod \
    build "${NEED_BUILD[@]}"

  log "build 完成"

  # 更新 marker(写入新 hash)
  for svc in "${NEED_BUILD[@]}"; do
    LAST_BUILD="/opt/w11-erp/.last_build_${svc//\//_}"
    NEW_HASH=$(find "$svc" -type f \
      -not -path '*/node_modules/*' \
      -not -path '*/.next/*' \
      -not -path '*/dist/*' \
      -not -path '*/.turbo/*' \
      -not -name '*.tsbuildinfo' \
      -not -path '*/coverage/*' \
      2>/dev/null | sort | xargs sha256sum 2>/dev/null | sha256sum | cut -c1-32)
    if [ -n "$NEW_HASH" ]; then
      echo "$NEW_HASH" > "$LAST_BUILD"
    fi
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
    echo "$CURRENT_NGINX_HASH" > "$LAST_DEPLOY_MARKER"
  else
    warn "nginx 容器未运行,跳过 reload"
  fi
else
  # 即使这次没 reload,也更新 marker(让下次能正确对比)
  echo "$CURRENT_NGINX_HASH" > "$LAST_DEPLOY_MARKER"
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