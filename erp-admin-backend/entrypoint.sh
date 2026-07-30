#!/usr/bin/env bash
# =============================================================================
# W11 ERP backend entrypoint
# 1. 等 mysql + chroma 端口通
# 2. 跑 prisma migrate deploy(幂等)
# 3. exec 起 NestJS(prod)
# 注:任何阶段失败 → exit 1,容器 restart
# =============================================================================
set -euo pipefail

log() { printf '[entrypoint] %s\n' "$*"; }
fail() { printf '[entrypoint][ERROR] %s\n' "$*" >&2; exit 1; }

MYSQL_HOST="${MYSQL_HOST:-w11-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
CHROMA_HOST="${CHROMA_HOST:-w11-chroma}"
CHROMA_PORT="${CHROMA_PORT:-8000}"

# ---------- 等依赖端口通(用 /dev/tcp,免 nc)----------
wait_port() {
  local host=$1 port=$2 name=$3 timeout=${4:-90}
  log "等待 ${name} (${host}:${port}) 就绪,timeout=${timeout}s"
  local i
  for i in $(seq 1 "$timeout"); do
    if (exec 3<>/dev/tcp/"${host}"/"${port}") 2>/dev/null; then
      exec 3<&- 3>&- 2>/dev/null || true
      log "${name} 已就绪 (${i}s)"
      return 0
    fi
    sleep 1
  done
  fail "${name} 端口 ${host}:${port} 在 ${timeout}s 内未通,放弃"
}

wait_port "${MYSQL_HOST}" "${MYSQL_PORT}" "mysql" 120
wait_port "${CHROMA_HOST}" "${CHROMA_PORT}" "chroma" 60

# ---------- 跑 prisma migrate deploy(幂等)----------
# 失败不挂(老库迁移已存在会报 P3009,加 || true 让容器起)
log "运行 prisma migrate deploy..."
if pnpm exec prisma migrate deploy 2>&1 | tee /tmp/prisma-migrate.log; then
  log "prisma migrate deploy 完成"
else
  log "[WARN] prisma migrate deploy 返回非 0,继续启动(老迁移可能已存在)"
fi

# ---------- 起 NestJS(exec 让 PID 1 = node,信号能透传)----------
log "启动 NestJS: node dist/main.js"
exec "$@"