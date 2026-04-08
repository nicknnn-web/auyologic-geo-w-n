# 前端静态站点 - Vite 构建（无需任何环境变量）
FROM node:22-alpine AS build

WORKDIR /src

COPY package*.json ./
RUN npm install

COPY . .

# 构建时不设置任何 API 环境变量
RUN npm run build

# 生产环境 - Caddy 提供静态文件 + 反向代理
FROM alpine:latest AS runtime

RUN apk add --no-cache caddy ca-certificates

COPY --from=build /src/dist /usr/share/caddy

# Caddy 配置：静态文件服务 + /api/* 反向代理到后端
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
