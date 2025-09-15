#!/bin/bash

# AI思维导图服务器部署脚本
# 使用sudo权限完整部署

set -e

echo "🚀 开始AI思维导图服务器部署..."
echo "=================================="

# 1. 检查Docker环境
echo "📋 检查Docker环境..."
sudo docker --version || { echo "❌ Docker未安装"; exit 1; }
sudo docker-compose --version || { echo "❌ Docker Compose未安装"; exit 1; }

# 2. 创建项目目录
echo "📁 创建项目目录..."
sudo mkdir -p /opt/ai-mindmap
cd /opt/ai-mindmap

# 3. 复制项目文件
echo "📦 复制项目文件..."
sudo cp -r * /opt/ai-mindmap/ 2>/dev/null || echo "请手动上传文件到/opt/ai-mindmap/"

# 4. 构建Docker镜像
echo "🏗️ 构建Docker镜像..."
sudo docker buildx build --load -t ai-mindmap:latest .

# 5. 停止旧容器（如果存在）
echo "🛑 停止旧容器..."
sudo docker stop ai-mindmap-container 2>/dev/null || true
sudo docker rm ai-mindmap-container 2>/dev/null || true

# 6. 启动新容器
echo "🐳 启动新容器..."
sudo docker run -d \
  --name ai-mindmap-container \
  -p 9301:9301 \
  --restart unless-stopped \
  -e HOST=0.0.0.0 \
  -e PORT=9301 \
  ai-mindmap:latest

# 7. 等待容器启动
echo "⏳ 等待容器启动..."
sleep 10

# 8. 检查容器状态
echo "🔍 检查容器状态..."
sudo docker ps | grep ai-mindmap

# 9. 显示访问信息
echo ""
echo "✅ 部署完成！"
echo "=================="
echo "应用地址: http://服务器IP:9301"
echo "容器名称: ai-mindmap-container"
echo ""
echo "📊 管理命令:"
echo "查看日志: sudo docker logs -f ai-mindmap-container"
echo "停止容器: sudo docker stop ai-mindmap-container"
echo "启动容器: sudo docker start ai-mindmap-container"
echo "重启容器: sudo docker restart ai-mindmap-container"
echo ""
echo "🔧 故障排除:"
echo "如果端口9301被占用，修改docker run命令中的端口映射:"
echo "sudo docker run -d -p 8080:9301 ai-mindmap:latest"