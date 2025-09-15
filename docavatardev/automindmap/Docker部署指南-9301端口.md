# AI思维导图 - Docker部署指南（9301端口）

## 🚀 快速部署（推荐）

### 方法一：一键部署脚本
双击运行 `Docker部署修复-9301端口.bat` 即可自动完成所有部署步骤。

### 方法二：手动部署步骤

#### 1. 构建镜像
```bash
docker build -t ai-mindmap:latest .
```

#### 2. 运行容器
```bash
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest
```

#### 3. 使用Docker Compose
```bash
docker-compose up -d
```

## 🔧 部署验证

### 检查容器状态
```bash
docker ps --filter name=ai-mindmap-app
```

### 检查健康状态
```bash
curl http://localhost:9301/health
```

### 访问应用
打开浏览器访问：http://localhost:9301

## 🛠️ 常用命令

### 容器管理
```bash
# 查看日志
docker logs -f ai-mindmap-app

# 停止容器
docker stop ai-mindmap-app

# 启动容器
docker start ai-mindmap-app

# 重启容器
docker restart ai-mindmap-app

# 进入容器
docker exec -it ai-mindmap-app sh

# 删除容器
docker rm -f ai-mindmap-app

# 删除镜像
docker rmi ai-mindmap:latest
```

### 故障排查
```bash
# 查看容器详细信息
docker inspect ai-mindmap-app

# 查看端口映射
docker port ai-mindmap-app

# 检查容器资源使用
docker stats ai-mindmap-app
```

## 📁 数据持久化

容器会自动挂载以下目录：
- `./uploads` → `/app/uploads`（上传文件）
- `./config` → `/app/config`（配置文件）
- `./logs` → `/app/logs`（日志文件）

## 🔍 问题排查

### 容器无法启动
1. 检查端口占用：
   ```bash
   netstat -ano | findstr :9301
   ```

2. 检查Docker日志：
   ```bash
   docker logs ai-mindmap-app
   ```

3. 重新构建镜像：
   ```bash
   docker build --no-cache -t ai-mindmap:latest .
   ```

### 无法访问应用
1. 检查防火墙设置
2. 确认Docker Desktop正在运行
3. 检查容器状态：
   ```bash
   docker ps
   ```

## 🌐 网络访问

### 局域网访问
使用你的局域网IP地址：
```
http://[你的IP]:9301
```

### 获取IP地址
Windows:
```bash
ipconfig
```

## 📊 性能优化

### 限制内存使用
```bash
docker run -d -p 9301:9301 --memory=1g --name ai-mindmap-app ai-mindmap:latest
```

### 设置环境变量
```bash
docker run -d -p 9301:9301 \
  -e NODE_ENV=production \
  -e PORT=9301 \
  --name ai-mindmap-app \
  ai-mindmap:latest
```

## 🔄 更新部署

### 拉取最新代码后重新部署
```bash
# 停止并删除旧容器
docker stop ai-mindmap-app
docker rm ai-mindmap-app

# 重新构建镜像
docker build -t ai-mindmap:latest .

# 启动新容器
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest
```

## ✅ 部署成功验证

1. 容器状态：`docker ps` 显示 `Up` 状态
2. 健康检查：访问 http://localhost:9301/health 返回 `{"status":"OK"}`
3. 应用访问：浏览器访问 http://localhost:9301 显示应用界面

## 📞 技术支持

如果部署遇到问题：
1. 检查Docker Desktop是否正常运行
2. 确认端口9301未被占用
3. 查看容器日志获取详细错误信息
4. 确保所有配置文件完整