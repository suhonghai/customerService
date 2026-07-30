#!/bin/bash
# 本地一键构建 backend + frontend + ai-cs-demo 三套 Docker 镜像
# 用法:VERSION=2026.07.17 IMAGE_REPO=w11-erp ./build-all.sh
set -euo pipefail

VERSION="${VERSION:-$(date +%Y.%m.%d)}"
IMAGE_REPO="${IMAGE_REPO:-w11-erp}"
W11_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "=== 镜像标签 ==="
echo "  IMAGE_REPO=$IMAGE_REPO"
echo "  VERSION=$VERSION"
echo ""

# ----- 1. backend -----
echo "=== 1. backend ==="
cd "$W11_ROOT/erp-admin-backend"
pnpm install --frozen-lockfile
pnpm build
docker build \
  -t "${IMAGE_REPO}/erp-admin-backend:${VERSION}" \
  -t "${IMAGE_REPO}/erp-admin-backend:latest" \
  .

# ----- 2. frontend -----
echo "=== 2. frontend ==="
cd "$W11_ROOT/erp-admin-frontend"
pnpm install --frozen-lockfile
pnpm build
docker build \
  -t "${IMAGE_REPO}/erp-admin-frontend:${VERSION}" \
  -t "${IMAGE_REPO}/erp-admin-frontend:latest" \
  .

# ----- 3. ai-cs-demo -----
echo "=== 3. ai-cs-demo ==="
cd "$W11_ROOT/ai-cs-demo"
pnpm install --frozen-lockfile
pnpm build
docker build \
  -t "${IMAGE_REPO}/ai-cs-demo:${VERSION}" \
  -t "${IMAGE_REPO}/ai-cs-demo:latest" \
  .

echo ""
echo "=== ✅ 全部构建完成 ==="
docker images | grep -E "${IMAGE_REPO}/(erp-admin-backend|erp-admin-frontend|ai-cs-demo)" || true
