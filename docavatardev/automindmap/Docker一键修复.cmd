@echo off
chcp 65001 >nul
title Docker一键修复
color 0A

echo ==========================================
echo        Docker一键修复工具
echo ==========================================
echo.

:: 检查Docker
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：Docker未安装或未启动
    pause
    exit /b 1
)

echo 1. 清理悬空镜像...
docker image prune -f

echo 2. 停止并删除旧容器...
docker stop ai-mindmap-app >nul 2>&1
docker rm ai-mindmap-app >nul 2>&1

echo 3. 构建新镜像...
cd /d "%~dp0"
docker build -t ai-mindmap:latest .

echo 4. 运行新容器...
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

echo.
echo 修复完成！
echo 访问地址：http://localhost:9301
echo.
pause