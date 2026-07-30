# =============================================================================
# W11 ERP Admin — frontend (Vite SPA) container
# multi-stage:builder 跑 pnpm build,runner 用 nginx 静态服务 + 反代 /api
#
# BUILD_ENV 决定走哪个 .env.{BUILD_ENV}(development/test/uat/production)
# 默认 production;docker build --build-arg BUILD_ENV=uat .
# =============================================================================

# 多环境构建参数(默认 production)
ARG BUILD_ENV=production

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm config set registry https://registry.npmmirror.com \
 && npm install -g pnpm@9 --registry=https://registry.npmmirror.com \
 && pnpm config set registry https://registry.npmmirror.com \
 && pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

# 把构建环境作为 ARG 在 builder 阶段再次声明(每个 FROM 之后 ARG 作用域重置)
ARG BUILD_ENV
ENV NODE_ENV=${BUILD_ENV}

# 优先跑 build:${BUILD_ENV},兜底走 build(若 BUILD_ENV=production 直接命中主命令)
RUN pnpm run build:${BUILD_ENV} || pnpm run build

# -----------------------------------------------------------------------------
# runner:nginx:stable-alpine,拷 dist 到 /usr/share/nginx/html,加载自定义 nginx.conf
# -----------------------------------------------------------------------------
FROM nginx:stable-alpine AS runner

# 清掉默认静态文件
RUN rm -rf /usr/share/nginx/html/*

# 拷 build 产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 自定义 nginx.conf(走 SPA fallback + /api 反代 backend)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx:stable-alpine 默认 CMD 就是 nginx -g 'daemon off;'
CMD ["nginx", "-g", "daemon off;"]