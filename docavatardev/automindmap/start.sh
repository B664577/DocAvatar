#!/bin/bash

# AI思维导图工具 - 一键启动脚本
# 适用于Linux/macOS

echo ""
echo "==============================================="
echo "   AI思维导图工具 - 一键启动"
echo "==============================================="
echo ""

# 检查Node.js是否已安装
if ! command -v node &> /dev/null; then
    echo "错误：未检测到Node.js！"
    echo ""
    echo "请访问 https://nodejs.org/ 下载并安装Node.js"
    echo "或使用包管理器安装："
    echo "  Ubuntu/Debian: sudo apt install nodejs npm"
    echo "  CentOS/RHEL: sudo yum install nodejs npm"
    echo "  macOS: brew install node"
    echo ""
    read -p "按任意键退出..."
    exit 1
fi

# 检查npm是否已安装
if ! command -v npm &> /dev/null; then
    echo "错误：未检测到npm！"
    echo "请确保Node.js安装正确"
    read -p "按任意键退出..."
    exit 1
fi

# 检查package.json是否存在
if [ ! -f "package.json" ]; then
    echo "错误：未找到package.json文件！"
    echo "请确保在正确的目录中运行此脚本"
    read -p "按任意键退出..."
    exit 1
fi

echo "正在安装项目依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "错误：依赖安装失败！"
    read -p "按任意键退出..."
    exit 1
fi

echo ""
echo "依赖安装完成！"
echo ""

# 启动服务
echo "正在启动AI思维导图服务..."
echo ""
echo "服务启动后，浏览器将自动打开 http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务..."
echo ""

# 等待2秒让用户看到信息
sleep 2

# 打开浏览器
if command -v open &> /dev/null; then
    # macOS
    open http://localhost:3000 &
elif command -v xdg-open &> /dev/null; then
    # Linux
    xdg-open http://localhost:3000 &
fi

# 启动服务器
node server.js