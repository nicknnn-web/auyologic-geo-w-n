# 前端静态站点 - Vite 构建（无需任何环境变量）
FROM node:22-alpine AS build

WORKDIR /src

COPY package*.json ./
RUN npm install

COPY . .

# 构建时不设置任何 API 环境变量
RUN npm run build

# 生产环境 - Node.js 提供静态文件 + API 反向代理
FROM node:22-alpine AS runtime

WORKDIR /app

# 安装 express（ESM 模式）
RUN echo '{"type":"module"}' > package.json && npm install express

# 复制构建产物和服务器
COPY --from=build /src/dist ./dist
COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
