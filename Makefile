# W11 ERP Admin — 一键开发/构建/部署入口
# 用法:make help
# 多环境:make ENV=development dev | make ENV=test up | make ENV=production up

.PHONY: help dev dev-all dev-server dev-web dev-cs dev-cs-prod dev-down dev-restart-backend dev-restart-frontend dev-restart-ai-cs dev-restart-all dev-status build deploy health logs up down logs-compose health-compose db-migrate migrate-deploy db-seed db-seed-cs db-init clean config

# ----- 路径配置 -----
ROOT_DIR := $(shell pwd)
LOG_DIR := $(ROOT_DIR)/logs
BACKEND_DIR := $(ROOT_DIR)/erp-admin-backend
FRONTEND_DIR := $(ROOT_DIR)/erp-admin-frontend
AI_CS_DIR := $(ROOT_DIR)/ai-cs-demo

# 2026 C3 整改:DEPLOY_DIR 已删除(deploy/ 整目录被替代)
# 生产部署走 docker compose,见下面的 deploy target

# ----- 日志文件 -----
BACKEND_LOG := $(LOG_DIR)/dev-server.log
FRONTEND_LOG := $(LOG_DIR)/dev-web.log
AI_CS_LOG := $(LOG_DIR)/dev-cs.log

# ----- Dev 进程管理(SkillHub 风格) -----
DEV_PROCESS := $(ROOT_DIR)/scripts/dev-process.sh
DEV_SERVER_PID := $(LOG_DIR)/dev-server.pid
DEV_WEB_PID := $(LOG_DIR)/dev-web.pid
DEV_AI_CS_PID := $(LOG_DIR)/dev-cs.pid
# 子进程 PID 副文件(pnpm dev 会 fork vite/next/nest,父 PID 文件保留 dev-process.sh single-PID 假设)
DEV_SERVER_EXTRAS_PID := $(LOG_DIR)/dev-server.extras.pid
DEV_WEB_EXTRAS_PID := $(LOG_DIR)/dev-web.extras.pid
DEV_AI_CS_EXTRAS_PID := $(LOG_DIR)/dev-cs.extras.pid

# ----- Readiness probe URLs(本机端口约定) -----
DEV_API_URL := http://localhost:3001/api/health/ready
DEV_WEB_URL := http://localhost:5173/
DEV_AI_CS_URL := http://localhost:9529/

# ----- 多环境开关(默认 development) -----
# 用法:make ENV=test up / make ENV=uat deploy / make ENV=production up
ENV ?= development
ENV_FILE := .env.$(ENV)
# 短名映射:production → prod overlay/dev overlay 短名处理
ifeq ($(ENV),development)
	COMPOSE_OVERLAY := docker-compose.dev.yml
	PROJECT_NAME := w11-erp-dev
else ifeq ($(ENV),production)
	COMPOSE_OVERLAY := docker-compose.prod.yml
	PROJECT_NAME := w11-erp-prod
else
	COMPOSE_OVERLAY := docker-compose.$(ENV).yml
	PROJECT_NAME := w11-erp-$(ENV)
endif
COMPOSE := docker compose --env-file $(ENV_FILE) -p $(PROJECT_NAME) -f docker-compose.yml -f $(COMPOSE_OVERLAY)

# ----- 前置检查:pnpm + docker 必须存在 -----
MISSING_BINS := $(shell \
  command -v pnpm >/dev/null 2>&1 || echo pnpm; \
  command -v docker >/dev/null 2>&1 || echo docker; \
)

# ----- 提示信息 -----
HELP_DESC_WIDTH := 18

help: ## 显示所有 target 列表
	@printf "\033[1mW11 ERP Admin — make targets\033[0m\n"
	@printf "\n"
	@printf "  多环境开关:make ENV=development dev | make ENV=test up | make ENV=production up\n"
	@printf "  当前默认 ENV=$(ENV)\n"
	@printf "\n"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-$(HELP_DESC_WIDTH)s\033[0m %s\n", $$1, $$2}'
	@printf "\n"
	@echo "前置依赖: pnpm >= 9, docker, Node >= 20"

# 前置依赖检查(给 dev / dev-all / dev-server / dev-web / dev-cs / build / deploy 用)
guard:
ifneq ($(MISSING_BINS),)
	@echo "Error: 缺少必备命令: $(strip $(MISSING_BINS))" >&2
	@echo "请安装后重试(pnpm >= 9, Node >= 20, Docker Desktop / OrbStack)。" >&2
	@exit 1
endif

# ===== 一键 Docker 部署(本机 = 生产) =====

config: ## 打印当前 ENV 解析出来的 compose config(校验用)
	$(COMPOSE) config

# cs-prisma-drift-guard:deploy 前硬性跑 prisma migrate deploy(防 schema 和 DB 漂移)
# 设计:用 `docker compose run --rm` one-shot 容器,不需要 backend 容器先起。
# 失败时 `up` 也会失败(避免 backend 起来后撞 P2022 column not found)。
# 注意:这个 target 是 `up` 的依赖,但 `db-migrate`(老 target,exec 进已起容器)保留兼容。
migrate-deploy: guard ## 在 backend 容器跑 prisma migrate deploy(防 schema/client/DB 漂移)
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "[ERROR] $(ENV_FILE) 不存在,先 cp .env.example $(ENV_FILE) 并填入 secrets" >&2; \
		exit 1; \
	fi
	@echo "=== 跑 prisma migrate deploy (ENV=$(ENV)) ==="
	@echo "  说明:跑前会自动 build backend 镜像(若需要);不依赖 backend 容器在跑"
	@echo "  失败原因常见:schema 和 DB 不一致 / 字段名 typo / DATABASE_URL 配错"
	@$(COMPOSE) run --rm erp-admin-backend pnpm exec prisma migrate deploy

up: guard migrate-deploy ## 一键拉起 5 个容器(mysql + chroma + backend + frontend + ai-cs-demo);自动前置跑 prisma migrate deploy
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "[ERROR] $(ENV_FILE) 不存在,先 cp .env.example $(ENV_FILE) 并填入 secrets" >&2; \
		exit 1; \
	fi
	@echo ""
	@echo "=== 当前部署配置 (ENV=$(ENV) → $(ENV_FILE)) ==="
ifeq ($(ENV),production)
	@echo "  JWT TTL:    access=3600s(1h) refresh=604800s(7d) — 由 docker-compose.prod.yml 硬编码"
else ifeq ($(ENV),development)
	@echo "  JWT TTL:    access=604800s(7d) refresh=604800s(7d) — dev 防过期"
else
	@echo "  JWT TTL:    走 $(ENV_FILE) 中 JWT_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN"
endif
	@echo "  Compose:    $(COMPOSE)"
	@echo ""
	$(COMPOSE) up -d --build
	@echo ""
	@echo "=== 等待 services healthy (最多 90s) ==="
	@for i in $$(seq 1 18); do \
		HEALTHY=$$($(COMPOSE) ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || true); \
		echo "  [$$((i*5))s] healthy 容器: $$HEALTHY/5"; \
		if [ "$$HEALTHY" -ge 5 ]; then echo "  ✓ all up"; break; fi; \
		sleep 5; \
	done
	@$(MAKE) --no-print-directory health-compose

down: ## 停所有容器(保留 volumes)
	$(COMPOSE) down --remove-orphans
	@echo "All containers stopped (volumes preserved)."

logs-compose: ## tail docker compose 日志(Ctrl+C 退出)
	$(COMPOSE) logs -f

health-compose: ## curl 三个端点(/health/live, /health/ready, /metrics, frontend, ai-cs)
	@echo "=== /api/health/live (backend:3001) ==="
	@curl -sS --max-time 5 http://localhost:3001/api/health/live | head -c 400 || true; echo
	@echo ""
	@echo "=== /api/health/ready (backend:3001) ==="
	@curl -sS --max-time 5 http://localhost:3001/api/health/ready | head -c 400 || true; echo
	@echo ""
	@echo "=== /api/metrics head (backend:3001) ==="
	@curl -sS --max-time 5 http://localhost:3001/api/metrics | head -5 || true
	@echo ""
	@echo "=== /  (frontend:5173) ==="
	@curl -sSI --max-time 5 http://localhost:5173/ | head -3 || true
	@echo ""
	@echo "=== /  (ai-cs-demo:9529) ==="
	@curl -sSI --max-time 5 http://localhost:9529/ | head -3 || true

db-migrate: guard ## 在 backend 容器里跑 prisma migrate deploy
	$(COMPOSE) exec -T erp-admin-backend pnpm exec prisma migrate deploy

db-seed: guard ## 在 backend 容器里跑 prisma db seed
	$(COMPOSE) exec -T erp-admin-backend pnpm exec prisma db seed

clean: guard ## 停 + 删 volumes(全清,慎用)
	$(COMPOSE) down -v --remove-orphans
	@echo "All containers + volumes removed."

# ===== 本地开发(本机进程跑 backend / frontend / ai-cs,只 docker 起依赖) =====

dev: guard ## 启动 docker compose 依赖服务(mysql + chroma),等待 healthcheck — 仅 ENV=development
ifneq ($(ENV),development)
	@echo "[ERROR] dev target 只支持 ENV=development,当前 ENV=$(ENV) 用 'make ENV=$(ENV) up'" >&2
	@exit 1
endif
	@mkdir -p $(LOG_DIR)
	$(COMPOSE) up -d --wait --remove-orphans mysql chroma

# nest start --watch 会 fork 一个跑 dist/main 的 node 子进程,dev-process.sh 抓到的是 pnpm 父 PID;
# 真正的 nest 子 PID 写进单独的 .extras.pid 副文件,不影响原 PID 文件 single-PID 假设(dev-process.sh 字节级冻结)。
# dev-down / dev-status 会读主 PID + 副 PID 一并处理。
dev-server: guard ## 启动 erp-admin-backend(NestJS start:dev,后台)
	@mkdir -p $(LOG_DIR)
	@echo "Starting erp-admin-backend -> $(BACKEND_LOG)"
	$(DEV_PROCESS) start --pid-file $(DEV_SERVER_PID) --log-file $(BACKEND_LOG) --cwd $(BACKEND_DIR) -- pnpm start:dev
	@for i in $$(seq 1 30); do \
		nest_pid=$$(pgrep -f "node.*erp-admin-backend/dist/main" 2>/dev/null || true); \
		if [ -n "$$nest_pid" ]; then \
			echo "$$nest_pid" > $(DEV_SERVER_EXTRAS_PID); \
			break; \
		fi; \
		sleep 1; \
	done; true

# pnpm dev → vite 会 fork vite 子进程;vite 子 PID 写到 .extras.pid 副文件防止孤儿
dev-web: guard ## 启动 erp-admin-frontend(Vite dev,后台)
	@mkdir -p $(LOG_DIR)
	@echo "Starting erp-admin-frontend -> $(FRONTEND_LOG)"
	$(DEV_PROCESS) start --pid-file $(DEV_WEB_PID) --log-file $(FRONTEND_LOG) --cwd $(FRONTEND_DIR) -- pnpm dev
	@for i in $$(seq 1 30); do \
		vite_pid=$$(pgrep -f "node.*erp-admin-frontend/.*vite/bin/vite" 2>/dev/null || true); \
		if [ -n "$$vite_pid" ]; then \
			echo "$$vite_pid" > $(DEV_WEB_EXTRAS_PID); \
			break; \
		fi; \
		sleep 1; \
	done; true

# pnpm dev → next dev 会 fork next 子进程;next 子 PID 写到 .extras.pid 副文件防止孤儿
dev-cs: guard ## 启动 ai-cs-demo(Next.js,后台,9529 端口由 package.json dev 脚本固定)
	@mkdir -p $(LOG_DIR)
	@echo "Starting ai-cs-demo -> $(AI_CS_LOG)"
	$(DEV_PROCESS) start --pid-file $(DEV_AI_CS_PID) --log-file $(AI_CS_LOG) --cwd $(AI_CS_DIR) -- pnpm dev
	@for i in $$(seq 1 30); do \
		next_pid=$$(pgrep -f "node.*ai-cs-demo/.*next/dist/bin/next dev" 2>/dev/null || true); \
		if [ -n "$$next_pid" ]; then \
			echo "$$next_pid" > $(DEV_AI_CS_EXTRAS_PID); \
			break; \
		fi; \
		sleep 1; \
	done; true

dev-cs-prod: guard ## 本机用 prod build 跑 ai-cs-demo(验镜像)
	@mkdir -p $(LOG_DIR)
	@echo "Building + starting ai-cs-demo (prod) -> $(AI_CS_LOG)"
	cd $(AI_CS_DIR) && pnpm build && nohup pnpm start > $(AI_CS_LOG) 2>&1 &
	@echo "PID: $$!"

db-seed-cs: ## 灌 FAQ 到 chroma(本机开发用,沿用 V1 seed-faq.ts)
	cd $(AI_CS_DIR) && pnpm exec tsx scripts/seed-faq.ts

dev-all: guard ## 一键启动:依赖服务 + backend + frontend + ai-cs-demo(全部后台) — 仅 ENV=development
ifneq ($(ENV),development)
	@echo "[ERROR] dev-all target 只支持 ENV=development,当前 ENV=$(ENV) 用 'make ENV=$(ENV) up'" >&2
	@exit 1
endif
	@mkdir -p $(LOG_DIR)
	@$(MAKE) dev
	@$(MAKE) db-init
	@$(MAKE) dev-server
	@$(MAKE) dev-web
	@$(MAKE) dev-cs
	@echo ""
	@echo "=== 等待 backend readiness (max 60s) ==="
	@ready=0; \
	for i in $$(seq 1 30); do \
		if curl -fsS --max-time 3 $(DEV_API_URL) >/dev/null 2>&1; then \
			echo "  [$$((i*2))s] backend ready"; \
			ready=1; break; \
		fi; \
		if ! $(DEV_PROCESS) status --pid-file $(DEV_SERVER_PID) >/dev/null 2>&1; then \
			echo "[ERROR] backend exited before ready. Check $(BACKEND_LOG)" >&2; \
			$(MAKE) -s dev-all-rollback; \
			exit 1; \
		fi; \
		nest_pid=$$(pgrep -f "node.*erp-admin-backend/dist/main" 2>/dev/null || true); \
		if [ -n "$$nest_pid" ]; then \
			echo "$$nest_pid" > $(DEV_SERVER_EXTRAS_PID); \
		elif [ -f $(DEV_SERVER_EXTRAS_PID) ]; then \
			echo "[ERROR] backend exited before ready. Check $(BACKEND_LOG)" >&2; \
			$(MAKE) -s dev-all-rollback; \
			exit 1; \
		fi; \
		echo "  [$$((i*2))s] backend not ready, retry..."; \
		sleep 2; \
	done; \
	if [ "$$ready" != "1" ]; then \
		echo "[ERROR] backend failed to become ready. Check $(BACKEND_LOG)" >&2; \
		$(MAKE) -s dev-all-rollback; \
		exit 1; \
	fi
	@echo "=== 等待 frontend readiness (max 60s) ==="
	@ready=0; \
	for i in $$(seq 1 30); do \
		if curl -fsSI --max-time 3 $(DEV_WEB_URL) >/dev/null 2>&1; then \
			echo "  [$$((i*2))s] frontend ready"; \
			ready=1; break; \
		fi; \
		if ! $(DEV_PROCESS) status --pid-file $(DEV_WEB_PID) >/dev/null 2>&1; then \
			echo "[ERROR] frontend exited before ready. Check $(FRONTEND_LOG)" >&2; \
			$(MAKE) -s dev-all-rollback; \
			exit 1; \
		fi; \
		echo "  [$$((i*2))s] frontend not ready, retry..."; \
		sleep 2; \
	done; \
	if [ "$$ready" != "1" ]; then \
		echo "[ERROR] frontend failed to become ready. Check $(FRONTEND_LOG)" >&2; \
		$(MAKE) -s dev-all-rollback; \
		exit 1; \
	fi
	@echo "=== 等待 ai-cs readiness (max 60s) ==="
	@ready=0; \
	for i in $$(seq 1 30); do \
		if curl -fsSI --max-time 3 $(DEV_AI_CS_URL) >/dev/null 2>&1; then \
			echo "  [$$((i*2))s] ai-cs ready"; \
			ready=1; break; \
		fi; \
		if ! $(DEV_PROCESS) status --pid-file $(DEV_AI_CS_PID) >/dev/null 2>&1; then \
			echo "[ERROR] ai-cs exited before ready. Check $(AI_CS_LOG)" >&2; \
			$(MAKE) -s dev-all-rollback; \
			exit 1; \
		fi; \
		echo "  [$$((i*2))s] ai-cs not ready, retry..."; \
		sleep 2; \
	done; \
	if [ "$$ready" != "1" ]; then \
		echo "[ERROR] ai-cs failed to become ready. Check $(AI_CS_LOG)" >&2; \
		$(MAKE) -s dev-all-rollback; \
		exit 1; \
	fi
	@echo ""
	@printf "| %-10s | %-30s | %-7s |\n" "Service" "URL" "Ready"
	@printf "|------------|--------------------------------|---------|\n"
	@printf "| %-10s | %-30s | %-7s |\n" "Backend" "$(DEV_API_URL)" "yes"
	@printf "| %-10s | %-30s | %-7s |\n" "Frontend" "$(DEV_WEB_URL)" "yes"
	@printf "| %-10s | %-30s | %-7s |\n" "AI-CS" "$(DEV_AI_CS_URL)" "yes"
	@echo ""
	@echo "=== dev-all 已就绪 ==="
	@echo "  Backend:  tail -f $(BACKEND_LOG)"
	@echo "  Frontend: tail -f $(FRONTEND_LOG)"
	@echo "  AI-CS:    tail -f $(AI_CS_LOG)"

dev-all-rollback:
	-$(DEV_PROCESS) stop --pid-file $(DEV_SERVER_PID) || true
	-$(DEV_PROCESS) stop --pid-file $(DEV_WEB_PID) || true
	-$(DEV_PROCESS) stop --pid-file $(DEV_AI_CS_PID) || true
	-rm -f $(DEV_SERVER_EXTRAS_PID) $(DEV_WEB_EXTRAS_PID) $(DEV_AI_CS_EXTRAS_PID) || true

# 自动初始化 dev DB:检测 _prisma_migrations 是否有 applied migration,
# 没有就跑 migrate deploy + seed(首次开新卷时);已有则跳过。
db-init: ## 自动检测并跑 prisma migrate + seed(用于 dev-all 内部)
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "[WARN] $(ENV_FILE) 不存在,跳过 db-init(请 cp .env.example $(ENV_FILE))"; \
		exit 0; \
	fi
	@set -a && . ./$(ENV_FILE) && set +a; \
	if docker exec w11-erp-dev-mysql-1 sh -c "mysql -u $${MYSQL_USER} -p$${MYSQL_PASSWORD} $${MYSQL_DATABASE} -e 'SELECT 1 FROM _prisma_migrations LIMIT 1'" >/dev/null 2>&1; then \
		echo "[db-init] DB 已初始化,跳过 migrate + seed"; \
	else \
		echo "[db-init] 检测到空 DB,跑 prisma migrate deploy + seed..."; \
		set -a && . $(BACKEND_DIR)/.env.$(ENV) && set +a; \
		cd $(BACKEND_DIR) && npx prisma migrate deploy 2>&1 | tail -5 && \
		npx prisma db seed 2>&1 | tail -5; \
		cd $(ROOT_DIR); \
	fi

# 先快照所有 PID(dev-process.sh stop 会 rm pid 文件),再停,最后清孤儿;
# nest start --watch fork 的 node dist/main 子进程没被父抓到,pnpm dev→vite/next 子也没被父抓到,
# 主 PID + 副 PID 文件统一兜底逐一 kill
dev-down: ## 精准停所有 PID 管理进程 + compose 容器(幂等)
	@backend_pids="$$(printf '%s\n%s' "$$([ -f $(DEV_SERVER_PID) ] && cat $(DEV_SERVER_PID))" "$$([ -f $(DEV_SERVER_EXTRAS_PID) ] && cat $(DEV_SERVER_EXTRAS_PID))")"; \
	web_pids="$$(printf '%s\n%s' "$$([ -f $(DEV_WEB_PID) ] && cat $(DEV_WEB_PID))" "$$([ -f $(DEV_WEB_EXTRAS_PID) ] && cat $(DEV_WEB_EXTRAS_PID))")"; \
	cs_pids="$$(printf '%s\n%s' "$$([ -f $(DEV_AI_CS_PID) ] && cat $(DEV_AI_CS_PID))" "$$([ -f $(DEV_AI_CS_EXTRAS_PID) ] && cat $(DEV_AI_CS_EXTRAS_PID))")"; \
	echo "Stopping NestJS backend..."; \
	$(DEV_PROCESS) stop --pid-file $(DEV_SERVER_PID) || true; \
	echo "Stopping Vite frontend..."; \
	$(DEV_PROCESS) stop --pid-file $(DEV_WEB_PID) || true; \
	echo "Stopping Next.js ai-cs-demo..."; \
	$(DEV_PROCESS) stop --pid-file $(DEV_AI_CS_PID) || true; \
	kill_remaining() { while read -r pid; do [ -n "$$pid" ] || continue; kill "$$pid" 2>/dev/null || true; done <<< "$$1"; }; \
	kill_remaining_9() { while read -r pid; do [ -n "$$pid" ] || continue; kill -9 "$$pid" 2>/dev/null || true; done <<< "$$1"; }; \
	if [ -n "$$backend_pids$$web_pids$$cs_pids" ]; then \
		kill_remaining "$$backend_pids"; \
		kill_remaining "$$web_pids"; \
		kill_remaining "$$cs_pids"; \
		sleep 1; \
		kill_remaining_9 "$$backend_pids"; \
		kill_remaining_9 "$$web_pids"; \
		kill_remaining_9 "$$cs_pids"; \
	fi; \
	rm -f $(DEV_SERVER_PID) $(DEV_WEB_PID) $(DEV_AI_CS_PID) $(DEV_SERVER_EXTRAS_PID) $(DEV_WEB_EXTRAS_PID) $(DEV_AI_CS_EXTRAS_PID); \
	echo "Stopping docker compose..."; \
	$(COMPOSE) down --remove-orphans 2>/dev/null || true; \
	echo "All dev processes stopped (idempotent, PID-based)."

dev-restart-backend: ## 精准停 backend PID + 重启
	-$(DEV_PROCESS) stop --pid-file $(DEV_SERVER_PID)
	@$(MAKE) dev-server

dev-restart-frontend: ## 精准停 frontend PID + 重启
	-$(DEV_PROCESS) stop --pid-file $(DEV_WEB_PID)
	@$(MAKE) dev-web

dev-restart-ai-cs: ## 精准停 ai-cs PID + 重启
	-$(DEV_PROCESS) stop --pid-file $(DEV_AI_CS_PID)
	@$(MAKE) dev-cs

dev-restart-all: ## 精准停 3 服务 PID + 全部重启
	-$(DEV_PROCESS) stop --pid-file $(DEV_SERVER_PID)
	-$(DEV_PROCESS) stop --pid-file $(DEV_WEB_PID)
	-$(DEV_PROCESS) stop --pid-file $(DEV_AI_CS_PID)
	@$(MAKE) dev-server
	@$(MAKE) dev-web
	@$(MAKE) dev-cs

dev-status: ## 查看 3 服务 RUNNING/STOPPED + docker compose ps
	@for entry in "Backend:$(DEV_SERVER_PID)" "Frontend:$(DEV_WEB_PID)" "AI-CS:$(DEV_AI_CS_PID)"; do \
		label=$${entry%%:*}; pid_file=$${entry#*:}; \
		printf "%-10s " "$$label"; \
		if $(DEV_PROCESS) status --pid-file "$$pid_file"; then \
			echo "RUNNING"; \
		else \
			echo "STOPPED"; \
		fi; \
	done
	@$(COMPOSE) ps

# ===== 构建 / 部署 / 健康检查 =====
# 2026 workflow C3 整改:deploy/*.sh 老脚本全删
# - 本地构建:各自 `pnpm --filter <pkg> build`
# - 生产部署:docker compose 编排(make ENV=production up)
# - 健康检查:见 `$(COMPOSE) ps` + 子包 /health endpoints

build: ## 本地构建所有子包(NestJS / Vite / Next.js 各自的 build)
	pnpm --filter erp-admin-backend build
	pnpm --filter erp-admin-frontend build
	pnpm --filter ai-cs-demo build

deploy: ## 生产部署 = make ENV=production up(docker compose 一键起)
	@echo "⚠️  别再 rm + cp 旧式 deploy.sh;直接 make ENV=production up"
	@echo "   见 CLAUDE.md「子包『在哪看什么』」+ 5× docker-compose.*.yml"
	@exit 1

health: ## 校验 docker compose 容器 + 关键 /health endpoints
	$(COMPOSE) ps
	@curl -sf -o /dev/null -w "backend /api/health/ready → %{http_code}\n" http://localhost:3001/api/health/ready || true
	@curl -sf -o /dev/null -w "ai-cs   ready       → %{http_code}\n" http://localhost:9529/ || true

ttl-check: guard ## 校验 prod JWT TTL(跑起来后调 login 拿 access token,decode exp 验证)
	@echo "=== 校验 prod JWT TTL(access 必须 ≈ 3600s, refresh 必须 ≈ 604800s)==="
	@LOGIN_RESP=$$(curl -sS -X POST http://localhost:3001/api/auth/login \
		-H "Content-Type: application/json" \
		-d '{"username":"admin","password":"Admin@123"}'); \
	ACCESS=$$(echo "$$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null); \
	if [ -z "$$ACCESS" ]; then echo "[ERROR] login 失败,response: $$LOGIN_RESP" >&2; exit 1; fi; \
	PAYLOAD=$$(echo "$$ACCESS" | cut -d. -f2); \
	PADDED=$$(echo "$$PAYLOAD====" | tr '_-' '/+'); \
	DECODED=$$(echo "$$PADDED" | base64 -d 2>/dev/null); \
	if [ -z "$$DECODED" ]; then echo "[ERROR] base64 decode 失败" >&2; exit 1; fi; \
	EXP=$$(echo "$$DECODED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exp',0))"); \
	IAT=$$(echo "$$DECODED" | python3 -c "import sys,json; print(json.load(sys.stdin).get('iat',0))"); \
	TTL=$$((EXP - IAT)); \
	echo "  access token TTL: $$TTL s"; \
	if [ "$$TTL" -ge 3500 ] && [ "$$TTL" -le 3700 ]; then echo "  ✓ access TTL ≈ 3600s(prod 模式正确)"; else echo "  ✗ access TTL 异常,期望 ≈ 3600s" >&2; exit 1; fi

logs: ## tail docker compose 日志 + logs/*.log
	@echo "=== docker compose logs (Ctrl+C 退出) ==="
	$(COMPOSE) logs -f &
	COMPOSE_PID=$$!; \
	tail -F $(LOG_DIR)/*.log 2>/dev/null & \
	TAIL_PID=$$!; \
	trap "kill $$COMPOSE_PID $$TAIL_PID 2>/dev/null" EXIT; \
	wait