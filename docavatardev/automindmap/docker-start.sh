#!/bin/bash

# AI思维导图工具 - Docker一键部署脚本
# 适用于Linux/macOS

echo ""
echo "==============================================="
echo "   AI思维导图工具 - Docker一键部署"
echo "==============================================="
echo ""

# 检查Docker是否已安装
if ! command -v docker &> /dev/null; then
    echo "错误：未检测到Docker！"
    echo ""
    echo "请访问 https://www.docker.com/products/docker-desktop/ 下载并安装Docker Desktop"
    echo "或使用包管理器安装："
    echo "  Ubuntu/Debian: sudo apt install docker.io docker-compose"
    echo "  CentOS/RHEL: sudo yum install docker docker-compose"
    echo "  macOS: 下载Docker Desktop"
    echo ""
    read -p "按任意键退出..."
    exit 1
fi

# 检查Docker Compose是否已安装
if ! command -v docker-compose &> /dev/null; then
    echo "错误：未检测到Docker Compose！"
    echo "请确保Docker安装正确"
    read -p "按任意键退出..."
    exit 1
fi

# 检查Docker服务是否运行
if ! docker info &> /dev/null; then
    echo "错误：Docker服务未运行！"
    echo "请启动Docker服务后再运行此脚本"
    read -p "按任意键退出..."
    exit 1
fi

echo "Docker环境检测完成！"
echo ""

# 构建并启动容器
echo "正在构建Docker镜像..."
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo "错误：Docker镜像构建失败！"
    read -p "按任意键退出..."
    exit 1
fi

echo ""
echo "正在启动服务..."
docker-compose up -d

if [ $? -ne 0 ]; then
    echo "错误：服务启动失败！"
    read -p "按任意键退出..."
    exit 1
fi

echo ""
echo "==============================================="
echo "   服务启动成功！"
echo "==============================================="
echo ""
echo "访问地址：http://localhost:3000"
echo ""
echo "查看日志：docker-compose logs -f"
echo "停止服务：docker-compose down"
echo ""
echo "按任意键退出..."
read -p ""