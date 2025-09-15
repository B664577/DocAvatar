#!/bin/bash

# AI思维导图工具 - 完整一键部署脚本
# 适用于Linux/macOS - 自动安装所有依赖

set -e

echo ""
echo "==============================================="
echo "   AI思维导图工具 - 完整一键部署"
echo "==============================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否以root权限运行
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}警告：此脚本不应以root权限运行${NC}"
   echo "请使用普通用户运行此脚本"
   exit 1
fi

# 检查操作系统
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
else
    echo -e "${RED}不支持的操作系统: $OSTYPE${NC}"
    exit 1
fi

echo "检测到操作系统: $OS"

# 安装Docker的函数
install_docker() {
    echo -e "${YELLOW}正在安装Docker...${NC}"
    
    if [[ "$OS" == "linux" ]]; then
        # Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y curl apt-transport-https ca-certificates gnupg lsb-release
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        # CentOS/RHEL
        elif command -v yum &> /dev/null; then
            sudo yum install -y yum-utils
            sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        else
            echo -e "${RED}不支持的Linux发行版${NC}"
            exit 1
        fi
    elif [[ "$OS" == "macos" ]]; then
        echo -e "${YELLOW}请手动安装Docker Desktop: https://www.docker.com/products/docker-desktop/${NC}"
        echo "安装完成后请重新运行此脚本"
        exit 1
    fi
    
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER
    
    echo -e "${GREEN}Docker安装完成！${NC}"
    echo -e "${YELLOW}请重新登录或运行 'newgrp docker' 命令以应用权限更改${NC}"
    echo -e "${YELLOW}然后重新运行此脚本${NC}"
    exit 0
}

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}未检测到Docker${NC}"
    read -p "是否自动安装Docker？(y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_docker
    else
        echo "请手动安装Docker后重试"
        exit 1
    fi
fi

# 检查Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}未检测到Docker Compose${NC}"
    if [[ "$OS" == "linux" ]]; then
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
    else
        echo "请安装Docker Desktop"
        exit 1
    fi
fi

# 检查Docker服务
if ! docker info &> /dev/null; then
    echo -e "${RED}Docker服务未运行${NC}"
    echo "正在尝试启动Docker服务..."
    sudo systemctl start docker
    sleep 5
    if ! docker info &> /dev/null; then
        echo -e "${RED}无法启动Docker服务${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}Docker环境检测完成！${NC}"

# 检查Git
if ! command -v git &> /dev/null; then
    echo -e "${YELLOW}正在安装Git...${NC}"
    if [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y git
        elif command -v yum &> /dev/null; then
            sudo yum install -y git
        fi
    elif [[ "$OS" == "macos" ]]; then
        echo "请安装Xcode命令行工具或Git"
        exit 1
    fi
fi

# 检查项目目录
if [[ ! -f "docker-compose.yml" ]]; then
    echo -e "${YELLOW}未检测到项目文件，正在克隆项目...${NC}"
    read -p "请输入项目目录名(默认为ai-mindmap): " PROJECT_DIR
    PROJECT_DIR=${PROJECT_DIR:-ai-mindmap}
    
    if [[ ! -d "$PROJECT_DIR" ]]; then
        git clone https://github.com/your-repo/ai-mindmap.git "$PROJECT_DIR"
        cd "$PROJECT_DIR"
    else
        cd "$PROJECT_DIR"
        git pull
    fi
else
    echo -e "${GREEN}检测到现有项目，正在更新...${NC}"
    if [[ -d ".git" ]]; then
        git pull
    fi
fi

# 创建必要的目录
mkdir -p uploads config

# 设置权限
chmod -R 755 uploads/

# 构建并启动容器
echo -e "${YELLOW}正在构建Docker镜像...${NC}"
docker-compose build --no-cache

if [ $? -ne 0 ]; then
    echo -e "${RED}错误：Docker镜像构建失败！${NC}"
    read -p "按任意键退出..."
    exit 1
fi

echo -e "${YELLOW}正在启动服务...${NC}"
docker-compose up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}错误：服务启动失败！${NC}"
    read -p "按任意键退出..."
    exit 1
fi

# 等待服务启动
echo -e "${YELLOW}等待服务启动...${NC}"
sleep 10

# 检查服务状态
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}===============================================${NC}"
    echo -e "${GREEN}   服务启动成功！${NC}"
    echo -e "${GREEN}===============================================${NC}"
    echo ""
    echo -e "访问地址：${GREEN}http://localhost:3000${NC}"
    echo ""
    echo "常用命令："
    echo "  查看日志：docker-compose logs -f"
    echo "  停止服务：docker-compose down"
    echo "  重启服务：docker-compose restart"
    echo "  查看状态：docker-compose ps"
    echo ""
else
    echo -e "${RED}警告：服务可能未正常启动${NC}"
    echo "请检查日志：docker-compose logs"
fi

echo -e "${GREEN}部署完成！${NC}"
read -p "按任意键退出..."