# Docker构建问题解决方案

## 🚨 问题原因
出现`<none>`镜像是因为构建过程中产生了中间层或构建失败。

## 🔧 快速解决步骤

### 方法1：使用修复脚本
双击运行 `修复Docker构建.bat` 自动修复

### 方法2：手动修复

#### 1. 清理悬空镜像
```bash
docker image prune -f
docker images --filter "dangling=true" -q | xargs docker rmi
```

#### 2. 重新构建
```bash
# 使用明确标签
docker build -t ai-mindmap:latest .

# 验证镜像
docker images | grep ai-mindmap
```

#### 3. 创建容器
```bash
# 删除旧容器（如果存在）
docker rm -f ai-mindmap-app

# 创建新容器
docker run -d -p 3000:3000 --name ai-mindmap-app ai-mindmap:latest
```

## 📋 预防措施

### 优化Dockerfile
```dockerfile
# 使用多阶段构建减少层数
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app .
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 使用docker-compose
```yaml
version: '3.8'
services:
  ai-mindmap:
    build: .
    image: ai-mindmap:latest  # 明确指定镜像名
    ports:
      - "3000:3000"
    restart: unless-stopped
```

## ✅ 验证成功
运行：
```bash
docker ps
docker logs ai-mindmap-app
```

访问：http://localhost:3000