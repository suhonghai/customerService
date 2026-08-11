# =============================================================================
# W9-10 ai-cs-demo (Next.js 16) container
# - builder:node:20-alpine 跑 next build
# - runner:node:20-alpine,只拷 standalone 必要文件(.next + public + node_modules prod)
# 注:没开 output:'standalone'(不动源代码),直接把 .next/ 整拷进 image(~150-250MB)
#
# 多环境支持(2026-07-13):
#   build 时 --build-arg APP_ENV=production|uat|test|development
#   默认 production;entrypoint / runtime 通过 .env.{APP_ENV} 或 compose env_file 注入。
# =============================================================================
FROM node:20-alpine AS builder

ARG APP_ENV=production
# 透传 build-time NEXT_PUBLIC_*,让 pnpm run build 时 process.env 有值 → 客户端 JS 烘焙正确。
# 缺这些 ARG → Next.js 把 NEXT_PUBLIC_* 当 undefined 烘进去 → 浏览器拿到空字符串 → 相对路径 404。
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_CHROMA_URL
ARG NEXT_PUBLIC_INTERNAL_TOKEN
ENV APP_ENV=${APP_ENV} \
    NODE_ENV=${APP_ENV} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_CHROMA_URL=${NEXT_PUBLIC_CHROMA_URL} \
    NEXT_PUBLIC_INTERNAL_TOKEN=${NEXT_PUBLIC_INTERNAL_TOKEN}

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
# 修 builder 阶段 devDeps 漂移:@tailwindcss/postcss 在 devDeps,
# NODE_ENV=production 下 pnpm install --frozen-lockfile 会跳过 → next build 报
# "Cannot find module '@tailwindcss/postcss'"。inline NODE_ENV=development 仅覆盖此 RUN,
# ENV 块里的 NODE_ENV=production 仍作用于 build 阶段(next build 优化)。
RUN npm config set registry https://registry.npmmirror.com \
 && npm install -g pnpm@9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com \
 && NODE_ENV=development pnpm install --frozen-lockfile

COPY next.config.ts tsconfig.json next-env.d.ts ./
COPY postcss.config.mjs ./
COPY public ./public
COPY src ./src
COPY scripts ./scripts

# 编译产物到 .next/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build

# -----------------------------------------------------------------------------
# runner:同样 node:20-alpine,直接 node_modules prod + .next
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runner

ARG APP_ENV=production

WORKDIR /app

ENV APP_ENV=${APP_ENV} \
    NODE_ENV=${APP_ENV} \
    PORT=9529 \
    NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache bash curl tini

# production-only deps
COPY package.json pnpm-lock.yaml ./
RUN npm config set registry https://registry.npmmirror.com \
 && npm install -g pnpm@9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com \
 && pnpm install --frozen-lockfile --prod

# build 产物(standalone 没开,整目录拷)
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY next.config.ts ./

EXPOSE 9529

# tini 当 PID 1,接住 SIGTERM 给 next start
ENTRYPOINT ["/sbin/tini", "--"]

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

CMD ["/usr/local/bin/entrypoint.sh"]