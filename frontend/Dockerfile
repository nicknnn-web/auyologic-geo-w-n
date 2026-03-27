# 前端静态站点 - Vite 构建
FROM node:22-alpine AS build

WORKDIR /src

# 硬编码 API 地址（Zeabur Docker runtime 下 env 变量不会在构建时生效）
ENV VITE_API_URL=https://auyologic.zeabur.app/api

# 复制 package.json 和依赖文件
COPY package*.json ./
RUN npm install

# 复制源代码
COPY . .

# 构建
RUN npm run build

# 生产环境 - 使用 Caddy 提供静态文件
FROM alpine:latest AS runtime

# 安装 Caddy
RUN apk add --no-cache caddy

# 从构建阶段复制 dist 文件
COPY --from=build /src/dist /usr/share/caddy

# Caddy 配置
RUN echo '*:8080 {
    root * /usr/share/caddy
    try_files {path} /index.html
    encode gzip
}' > /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
