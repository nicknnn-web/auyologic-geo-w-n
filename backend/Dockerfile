FROM node:20-alpine

WORKDIR /app

# 复制 package.json 先安装依赖（利用缓存）
COPY package*.json ./
RUN npm install --production

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "src/index.js"]
