# =============================================================================
# W11 ERP Admin — backend (NestJS + Prisma) container
# multi-stage: builder 用 node:20-alpine 全量构建,runner 拷 dist + node_modules
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# 先拷 lockfile 最大化 cache
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

# 装 pnpm(corepack 拉 npmjs 国内不通,改走 npmmirror)
RUN npm config set registry https://registry.npmmirror.com \
 && npm install -g pnpm@9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com

# 全量装(包含 devDependencies — tsc / nest cli / prisma CLI 都需要)
RUN pnpm install --frozen-lockfile

# 生成 prisma client
RUN pnpm exec prisma generate

# 拷源码并 build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

# build:nestjs 编译成 dist/
RUN pnpm run build

# -----------------------------------------------------------------------------
# runner:仅拷 dist + 全量 node_modules(dev 也带 — prisma CLI / tsx 等需要跑 migrate/seed)
# alpine openssl 缺失时 prisma 用 openssl-1.1.x 兜底,装个 openssl 防 warn
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 多环境支持:build 时通过 --build-arg NODE_ENV=development 注入,
# 默认 production。ConfigModule 会按 NODE_ENV 选 .env.{mode} 加载。
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV} \
    PORT=3001 \
    LOG_DIR=/data/logs/erp-admin

RUN apk add --no-cache bash curl openssl

# 全量装(devDependencies 留着:prisma CLI + tsx 用于 migrate / seed)
# 注意:不能 ENV NODE_ENV=production 后跑 pnpm install — 会跳过 devDeps,
#       所以 install 步骤显式 unset NODE_ENV,装完再设回 production
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN npm config set registry https://registry.npmmirror.com \
 && npm install -g pnpm@9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com \
 && NODE_ENV=development pnpm install --frozen-lockfile \
 && NODE_ENV=development pnpm exec prisma generate

# 拷编译产物
COPY --from=builder /app/dist ./dist

# 上传目录 + 日志目录(run 时 volume 挂)
RUN mkdir -p /data/uploads /data/logs/erp-admin

# 健康检查(进程活着 = 200;NestJS 不返 200 我们就 restart)
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:${PORT}/api/health/live || exit 1

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/main.js"]