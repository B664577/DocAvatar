# AI思维导图服务器部署指南

## 🚀 一键部署方案

### 方案1: 使用Docker Compose（推荐）

#### 步骤1: 上传文件到服务器
```bash
# 在本地打包项目
tar -czf ai-mindmap.tar.gz *

# 上传到服务器（替换your-server-ip）
scp ai-mindmap.tar.gz user@your-server-ip:/tmp/
```

#### 步骤2: 服务器端部署
```bash
# 连接到服务器
ssh user@your-server-ip

# 解压文件
cd /tmp
tar -xzf ai-mindmap.tar.gz

# 一键部署
chmod +x deploy-with-compose.sh
./deploy-with-compose.sh
```

### 方案2: 手动部署

#### 1. 安装Docker
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose

# CentOS/RHEL
sudo yum install -y docker docker-compose

# 启动Docker
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

#### 2. 部署应用
```bash
# 创建项目目录
sudo mkdir -p /opt/ai-mindmap
cd /opt/ai-mindmap

# 上传所有项目文件到此处
# 包括: Dockerfile, docker-compose.yml, server.js, package.json等

# 设置权限
sudo chown -R $USER:$USER /opt/ai-mindmap

# 使用Docker Compose部署
docker-compose up -d --build

# 或者使用Docker直接部署
sudo docker build -t ai-mindmap:latest .
sudo docker run -d \
  --name ai-mindmap-container \
  -p 9301:9301 \
  --restart unless-stopped \
  -e HOST=0.0.0.0 \
  -e PORT=9301 \
  ai-mindmap:latest
```

#### 3. 验证部署
```bash
# 检查容器状态
sudo docker ps

# 查看日志
sudo docker logs -f ai-mindmap-container

# 测试访问
curl http://localhost:9301
```

## 📊 管理命令

### Docker Compose管理
```bash
# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down
```

### Docker管理
```bash
# 查看容器
sudo docker ps

# 查看日志
sudo docker logs -f ai-mindmap-container

# 重启容器
sudo docker restart ai-mindmap-container

# 停止容器
sudo docker stop ai-mindmap-container
```

## 🔧 常见问题

### 端口冲突
如果9301端口被占用，修改端口映射：
```bash
# 修改 docker-compose.yml 中的 ports 部分
ports:
  - "8080:9301"
```

### 防火墙设置
```bash
# Ubuntu/Debian
sudo ufw allow 9301

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=9301/tcp
sudo firewall-cmd --reload
```

### 域名访问
使用Nginx反向代理：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:9301;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🌐 访问地址
部署完成后，通过以下地址访问：
- **服务器IP**: http://your-server-ip:9301
- **域名访问**: http://your-domain.com

## 📁 项目文件清单
确保上传以下文件到服务器：
- Dockerfile
- docker-compose.yml
- server.js
- package.json
- package-lock.json
- 所有前端文件（.html, .css, .js）
- uploads/ 目录（用于文件上传）

## 🚀 快速部署
```bash
# 一键部署命令
curl -fsSL https://raw.githubusercontent.com/your-repo/deploy.sh | bash
```