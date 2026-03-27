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

RUN apk add --no-cache caddy

COPY --from=build /src/dist /usr/share/caddy

# Caddy 配置：静态文件服务 + /api/* 反向代理到后端
RUN echo '*:8080 {
    root * /usr/share/caddy
    encode gzip

    # /api/* 代理到后端（handle 保持原始路径不变）
    handle /api/* {
        reverse_proxy https://auyologic.zeabur.app {
            header_up Host {host}
            header_up X-Forwarded-Host {host}
        }
    }

    # 其他路径：SPA fallback
    handle {
        try_files {path} /index.html
    }
}' > /etc/caddy/Caddyfile

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
