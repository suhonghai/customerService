#!/bin/bash
# 一键部署:本地构建 + push 镜像 + 远端 pull + docker compose up
# 用法:DEPLOY_HOST=ubuntu@your-server-ip VERSION=2026.07.17 IMAGE_REPO=w11-erp ENV=production ./deploy.sh

set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:?请设 DEPLOY_HOST=ubuntu@your-server-ip}"
SSH_KEY="${SSH_KEY:-~/.ssh/erp_admin}"
REMOTE_DIR="${REMOTE_DIR:-/home/deploy/w11-erp-admin}"
ENV="${ENV:-production}"
VERSION="${VERSION:-$(date +%Y.%m.%d)}"
IMAGE_REPO="${IMAGE_REPO:-w11-erp}"

echo "=== Deploy config ==="
echo "  DEPLOY_HOST=$DEPLOY_HOST"
echo "  REMOTE_DIR=$REMOTE_DIR"
echo "  ENV=$ENV"
echo "  VERSION=$VERSION"
echo "  IMAGE_REPO=$IMAGE_REPO"
echo ""

echo "=== 1. 本地构建 (build-all.sh) ==="
bash "$(dirname "$0")/build-all.sh"

echo ""
echo "=== 2. 本地 push 三套镜像 ==="
for SERVICE in erp-admin-backend erp-admin-frontend ai-cs-demo; do
  echo "[PUSH] $SERVICE:${VERSION}"
  docker push "${IMAGE_REPO}/${SERVICE}:${VERSION}"
done

echo ""
echo "=== 3. 远端 pull + compose up ==="
ssh -i "$SSH_KEY" "$DEPLOY_HOST" "DEPLOY_DIR=$REMOTE_DIR IMAGE_REPO=$IMAGE_REPO VERSION=$VERSION ENV=$ENV bash -s" << 'REMOTE_EOF'
set -euo pipefail

cd "$DEPLOY_DIR"

echo "[REMOTE] pull 三套镜像"
for SERVICE in erp-admin-backend erp-admin-frontend ai-cs-demo; do
  docker pull "${IMAGE_REPO}/${SERVICE}:${VERSION}"
done

echo "[REMOTE] compose up -d"
# 沿用 W11 Makefile 的 COMPOSE 变量,显式包含 ai-cs-demo
docker compose \
  --env-file ".env.${ENV}" \
  -p "w11-erp-${ENV}" \
  -f docker-compose.yml \
  -f "docker-compose.${ENV}.yml" \
  up -d backend frontend ai-cs-demo

echo "[REMOTE] 等 30s 让容器启动"
sleep 30

echo "[REMOTE] 容器状态"
docker compose \
  -p "w11-erp-${ENV}" \
  -f docker-compose.yml \
  -f "docker-compose.${ENV}.yml" \
  ps
REMOTE_EOF

echo ""
echo "=== ✅ 部署完成 ==="
echo "  镜像: ${IMAGE_REPO}/{erp-admin-backend,erp-admin-frontend,ai-cs-demo}:${VERSION}"
echo "  主机: $DEPLOY_HOST  环境: $ENV"
