#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — 服务更新脚本
# 用于后续发布新版本:
#   1. mac 本地 build 新镜像 + save + scp 到服务器
#   2. 服务器跑这个脚本 load 新镜像 + 重启对应服务
#
# 用法:
#   sudo bash deploy/scripts/update.sh [backend|frontend|ai-cs-demo|all]
# =============================================================================

set -euo pipefail

PROJECT_ROOT="/opt/w11-erp"
IMAGES_DIR="/opt/w11-erp/images"
IMAGES_TAR="$IMAGES_DIR/w11-erp-images.tar"

TARGET="${1:-all}"

cd "$PROJECT_ROOT"

# 加载新镜像(若还没 load)
if [ -f "$IMAGES_TAR" ]; then
  echo "load 镜像..."
  docker load -i "$IMAGES_TAR"
fi

case "$TARGET" in
  backend)
    docker compose --env-file .env.production \
      -f docker-compose.yml -f docker-compose.prod.yml \
      -p w11-erp-prod \
      up -d --no-deps erp-admin-backend
    ;;
  frontend)
    docker compose --env-file .env.production \
      -f docker-compose.yml -f docker-compose.prod.yml \
      -p w11-erp-prod \
      up -d --no-deps erp-admin-frontend nginx
    ;;
  ai-cs-demo)
    docker compose --env-file .env.production \
      -f docker-compose.yml -f docker-compose.prod.yml \
      -p w11-erp-prod \
      up -d --no-deps ai-cs-demo nginx
    ;;
  all)
    docker compose --env-file .env.production \
      -f docker-compose.yml -f docker-compose.prod.yml \
      -p w11-erp-prod \
      up -d --no-deps erp-admin-backend erp-admin-frontend ai-cs-demo nginx
    ;;
  *)
    echo "用法: $0 [backend|frontend|ai-cs-demo|all]"
    exit 1
    ;;
esac

echo ""
echo "更新完成,等 30s 后查看状态:"
sleep 5
docker compose --env-file .env.production \
  -f docker-compose.yml -f docker-compose.prod.yml \
  -p w11-erp-prod \
  ps