#!/bin/bash

# AI思维导图一键部署脚本（Docker Compose版）
# 适用于Ubuntu/CentOS等Linux服务器

set -e

echo "🚀 AI思维导图一键部署开始"
echo "=============================="

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查系统
if [[ "$EUID" -eq 0 ]]; then
   echo -e "${RED}⚠️  请不要使用root用户运行此脚本${NC}"
   exit 1
fi

# 2. 安装Docker和Docker Compose
echo -e "${YELLOW}📦 检查Docker环境...${NC}"
if ! command -v docker &> /dev/null; then
    echo "安装Docker..."
    curl -fsSL https://get.docker.com | sudo bash
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✅ Docker安装完成，请重新登录后继续${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "安装Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# 3. 创建部署目录
echo -e "${YELLOW}📁 创建项目目录...${NC}"
sudo mkdir -p /opt/ai-mindmap
cd /opt/ai-mindmap

# 4. 复制项目文件（提示用户上传）
echo -e "${YELLOW}📤 请将项目文件上传到 /opt/ai-mindmap/ 目录${NC}"
echo "文件包括: Dockerfile, docker-compose.yml, server.js, package.json等"

# 5. 等待用户确认
read -p "文件上传完成后按回车继续..."

# 6. 设置权限
echo -e "${YELLOW}🔧 设置权限...${NC}"
sudo chown -R $USER:$USER /opt/ai-mindmap

# 7. 构建和启动
echo -e "${YELLOW}🏗️  构建镜像...${NC}"
sudo docker-compose build

echo -e "${YELLOW}🚀 启动服务...${NC}"
sudo docker-compose up -d

# 8. 等待启动
echo -e "${YELLOW}⏳ 等待服务启动...${NC}"
sleep 15

# 9. 检查状态
echo -e "${GREEN}✅ 部署完成！${NC}"
echo "=============================="
echo "服务状态:"
sudo docker-compose ps

echo ""
echo -e "${GREEN}🌐 访问地址: http://$(hostname -I | awk '{print $1}'):9301${NC}"
echo ""
echo "📊 管理命令:"
echo "查看日志: sudo docker-compose logs -f"
echo "停止服务: sudo docker-compose down"
echo "重启服务: sudo docker-compose restart"
echo ""
echo "🔧 故障排除:"
echo "如果端口冲突，编辑 docker-compose.yml 修改端口映射"