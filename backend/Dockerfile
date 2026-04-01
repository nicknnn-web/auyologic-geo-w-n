# Debian 系镜像：Playwright Chromium 需 glibc + apt 安装系统依赖（Alpine 不适用）
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --production \
  && npx playwright install chromium --with-deps

COPY . .
RUN rm -f .env || true

EXPOSE 3001

CMD ["node", "src/index.js"]
