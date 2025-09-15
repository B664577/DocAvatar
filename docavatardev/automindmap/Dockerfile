# 使用Node.js官方镜像作为基础
FROM node:18-alpine

# 安装必要的工具（包括curl用于健康检查）
RUN apk add --no-cache curl

# 设置工作目录
WORKDIR /app

# 设置监听主机为0.0.0.0
ENV HOST=0.0.0.0

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force \
    && sed -i "s/let isDebugMode = !module.parent;/var isDebugMode = false;/" node_modules/pdf-parse/index.js

# 复制应用代码
COPY . .

# 创建必要的目录并设置权限
RUN mkdir -p uploads config logs && \
    chown -R node:node /app

# 切换到非root用户
USER node

# 暴露端口
EXPOSE 9301

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:9301/health || exit 1

# 启动应用
CMD ["node", "server.js"]