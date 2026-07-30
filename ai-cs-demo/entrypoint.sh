#!/usr/bin/env bash
# =============================================================================
# W9-10 ai-cs-demo entrypoint
# 1. 确认 APP_ENV(默认 production)
# 2. 等 chroma 端口通(若 CHROMA_HOST 注入)
# 3. exec 启 Next.js production server on 9529
#
# 多环境支持(2026-07-13):
#   APP_ENV 来自 build arg / compose env,影响 next.config.ts 注入 + env.ts 校验。
# =============================================================================
set -euo pipefail

log() { printf '[entrypoint] %s\n' "$*"; }
fail() { printf '[entrypoint][ERROR] %s\n' "$*" >&2; exit 1; }

export APP_ENV="${APP_ENV:-production}"
export NODE_ENV="${NODE_ENV:-$APP_ENV}"

CHROMA_HOST="${CHROMA_HOST:-w11-chroma}"
CHROMA_PORT="${CHROMA_PORT:-8000}"
PORT="${PORT:-9529}"

wait_port() {
  local host=$1 port=$2 name=$3 timeout=${4:-60}
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

wait_port "${CHROMA_HOST}" "${CHROMA_PORT}" "chroma" 60

log "启动 Next.js production: node node_modules/next/dist/bin/next start -p ${PORT}"
exec node node_modules/next/dist/bin/next start -p "${PORT}"