#!/usr/bin/env bash
# =============================================================================
# W11 ERP Admin — mac 端迭代部署脚本
#
# 在本地(mac)跑这个脚本即可完成代码迭代部署:
#   1. mac: git pull origin prod(从 GitHub 拉最新代码)
#   2. mac: rsync 增量文件到服务器(走 SSH,带宽稳定)
#   3. mac: ssh 到服务器触发 update.sh(自动判断要 build 哪些服务 + 是否 reload nginx)
#
# 用法(在项目根目录跑):
#   ./deploy/scripts/iterate.sh                            # 全自动(根据 git diff 自动判断)
#   ./deploy/scripts/iterate.sh --service erp-admin-backend # 强制 rebuild backend
#   ./deploy/scripts/iterate.sh --migrate                  # 跑 prisma migrate deploy
#   ./deploy/scripts/iterate.sh --reload-only              # 只同步 nginx conf + reload
#   ./deploy/scripts/iterate.sh --dry-run                  # 只显示会做什么,不实际执行
#
# 前置(一次性,已完成):
#   - 服务器装好 docker + compose
#   - mac 的 ~/.ssh/id_ed25519.pub 已加到服务器的 ~/.ssh/authorized_keys
#   - 服务器的 /opt/w11-erp 是已部署好的项目(首次部署走 install.sh)
# =============================================================================

set -euo pipefail

# ============== 路径 ==============
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ============== 服务器配置(可改) ==============
SERVER_HOST="${DEPLOY_HOST:-ubuntu@182.254.244.242}"
SERVER_PROJECT_ROOT="/opt/w11-erp"

# 不传 .env.production 这类敏感文件(本地有的跟服务器一致;服务器已经存在)
EXCLUDE_FROM_RSYNC=(
  "--exclude=.git"
  "--exclude=node_modules"
  "--exclude=*.log"
  "--exclude=.DS_Store"
  "--exclude=dist"
  "--exclude=.next"
  "--exclude=.turbo"
  "--exclude=*.tsbuildinfo"
)

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

# ============== 参数 ==============
DRY_RUN=0
SERVICE_ARG=""
MIGRATE=0
RELOAD_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=1 ;;
    --migrate)      MIGRATE=1 ;;
    --reload-only)  RELOAD_ONLY=1 ;;
    --service)      shift; SERVICE_ARG="${1:-}" ;;
    --service=*)    SERVICE_ARG="${arg#--service=}" ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) warn "未知参数: $arg" ;;
  esac
done

# ============== 0. 前置 ==============
step "0. 前置检查"

cd "$PROJECT_ROOT"

# git 仓库
if [ ! -d ".git" ]; then
  fail "当前目录不是 git 仓库"
fi

# 当前分支
BRANCH=$(git rev-parse --abbrev-ref HEAD)
log "当前分支: $BRANCH"
[ "$BRANCH" = "prod" ] || warn "当前不在 prod 分支(在 $BRANCH)"

# 当前 commit
BEFORE=$(git rev-parse --short HEAD)
log "当前 HEAD(mac): $BEFORE"

# 服务器 SSH 通不通
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SERVER_HOST" true 2>/dev/null; then
  fail "SSH 不到 $SERVER_HOST(检查 ssh config / 服务器防火墙 / 公钥)"
fi
log "SSH 通: $SERVER_HOST"

# 服务器项目目录在不在
if ! ssh -o ConnectTimeout=5 "$SERVER_HOST" "test -d $SERVER_PROJECT_ROOT" 2>/dev/null; then
  fail "服务器 $SERVER_PROJECT_ROOT 不存在,先跑 install.sh"
fi

# ============== 1. git pull ==============
step "1. git pull origin $BRANCH (mac 端)"

if ! git pull --ff-only origin "$BRANCH" 2>&1 | tail -5; then
  warn "git pull --ff-only 失败(本地有未 push commit?)"
  read -rp "强制覆盖本地未提交改动? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || fail "用户中断"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

AFTER=$(git rev-parse --short HEAD)
log "新 HEAD: $AFTER"

if [ "$BEFORE" = "$AFTER" ]; then
  log "无新 commit,无需部署"
  exit 0
fi

echo ""
echo "本次提交:"
git log --oneline "$BEFORE..$AFTER"
echo ""

# ============== 2. 预判要做什么 ==============
step "2. 预判要做什么(给个预览)"

CHANGED=$(git diff --name-only "$BEFORE..$AFTER")
echo "本次变更文件:"
git diff --stat "$BEFORE..$AFTER"
echo ""

ACTIONS=()
if echo "$CHANGED" | grep -q '^deploy/nginx/'; then
  ACTIONS+=("nginx 配置变更 → 服务器 reload(零停机)")
fi
for svc in erp-admin-backend erp-admin-frontend ai-cs-demo; do
  if echo "$CHANGED" | grep -q "^$svc/"; then
    ACTIONS+=("$svc 代码变更 → 服务器 rebuild + restart")
  fi
done
if echo "$CHANGED" | grep -q '^erp-admin-backend/prisma/schema.prisma'; then
  ACTIONS+=("Prisma schema 变更 → 服务器跑 prisma migrate deploy(不 reset)")
fi
if [ "${#ACTIONS[@]}" -eq 0 ]; then
  ACTIONS+=("只有配置/文档变更,无需重建镜像,只需同步文件")
fi
echo "计划执行:"
for a in "${ACTIONS[@]}"; do echo "  • $a"; done
echo ""

if [ "$DRY_RUN" = "1" ]; then
  log "dry-run 模式,只显示不做"
  exit 0
fi

# ============== 3. rsync 增量文件到服务器 ==============
step "3. rsync 增量文件到 $SERVER_HOST:$SERVER_PROJECT_ROOT"

# mac 上有 /Users/suesea/sueSea/customerService/*,传到服务器 /opt/w11-erp/
# --delete:删服务器上 git 删除的文件(小心,别删 .env.production 这类 untracked 的)
#   .env.production 是 .gitignore 排除的,rsync 不会动它(因为本地也不传)
# --rsync-path:服务器可能没装 rsync,先 apt 装(常见 Ubuntu 默认装了的)

# 检查 rsync
if ! ssh "$SERVER_HOST" "command -v rsync" >/dev/null 2>&1; then
  warn "服务器没装 rsync,装一下"
  ssh "$SERVER_HOST" "sudo apt-get install -y rsync" 2>&1 | tail -3
fi

# 注意:mac 上 rsync 用 --exclude-from 时,- 路径用相对路径;我们 cd 到项目根
cd "$PROJECT_ROOT"
rsync -avz --human-readable --progress \
  "${EXCLUDE_FROM_RSYNC[@]}" \
  -e ssh \
  ./ "$SERVER_HOST:$SERVER_PROJECT_ROOT/" \
  | tail -20

log "文件同步完成"

# ============== 4. ssh 触发服务器 update.sh ==============
step "4. 触发服务器 update.sh"

REMOTE_CMD="cd $SERVER_PROJECT_ROOT && bash deploy/scripts/update.sh"
if [ -n "$SERVICE_ARG" ]; then
  REMOTE_CMD="$REMOTE_CMD $SERVICE_ARG"
fi
if [ "$MIGRATE" = "1" ]; then
  REMOTE_CMD="$REMOTE_CMD --migrate"
fi
if [ "$RELOAD_ONLY" = "1" ]; then
  REMOTE_CMD="$REMOTE_CMD --reload-only"
fi

log "远程命令: $REMOTE_CMD"
echo ""
ssh "$SERVER_HOST" "$REMOTE_CMD"

step "✓ 迭代部署完成"
echo ""
echo "📌 本次 commit: $AFTER"
echo "📋 回滚(如果出事):"
echo "  git reset --hard $BEFORE && $0"
echo ""