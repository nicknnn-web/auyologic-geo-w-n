FROM node:20-alpine

WORKDIR /app

# 创建 uploads 目录（修正路径问题）
RUN mkdir -p /app/uploads

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
