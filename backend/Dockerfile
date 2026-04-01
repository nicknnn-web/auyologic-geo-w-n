# Debian 系镜像：Playwright 需 glibc + apt（postinstall 会 playwright install --with-deps）
FROM node:20-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=0

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN rm -f .env || true

EXPOSE 3001

CMD ["node", "src/index.js"]
