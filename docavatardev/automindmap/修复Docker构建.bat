@echo off
title Docker镜像修复工具
color 0A

echo ╔══════════════════════════════════════════╗
echo ║        Docker镜像修复工具                ║
echo ╚══════════════════════════════════════════╝
echo.

:: 检查Docker是否运行
docker info >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：Docker未运行或未安装
    echo 请确保Docker Desktop已启动
    pause
    exit /b 1
)

echo 1. 清理悬空镜像...
docker image prune -f

echo 2. 查看现有镜像...
docker images

echo 3. 重新构建镜像...
cd /d "%~dp0"

:: 使用明确的标签和名称
echo 4. 构建新的镜像...
docker build -t ai-mindmap:latest .

echo 5. 删除旧的none镜像...
for /f "tokens=3" %%i in ('docker images --filter "dangling=true" -q') do (
    docker rmi %%i >nul 2>&1
)

echo 6. 查看最终镜像...
docker images | findstr "ai-mindmap"

echo 7. 创建并运行容器...
docker rm -f ai-mindmap-app >nul 2>&1
docker run -d -p 3000:3000 --name ai-mindmap-app ai-mindmap:latest

echo.
echo ╔══════════════════════════════════════════╗
echo ║ 修复完成！访问 http://localhost:3000     ║
echo ╚══════════════════════════════════════════╝
echo.
pause