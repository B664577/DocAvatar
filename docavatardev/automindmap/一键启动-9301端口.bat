@echo off
chcp 65001 >nul
title AI思维导图 - 9301端口部署
color 0A

echo.
echo ================================================
echo    AI思维导图工具 - 9301端口一键部署
echo ================================================
echo.

:: 检查Docker
docker --version >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：Docker未安装或未启动
    echo 请先安装Docker Desktop并启动
    pause
    exit /b 1
)

:: 检查Docker是否运行
docker ps >nul 2>&1
if %errorLevel% neq 0 (
    echo 正在启动Docker服务...
    net start com.docker.service >nul 2>&1
    timeout /t 5 /nobreak >nul
)

:: 清理旧容器
echo 正在清理旧容器...
docker stop ai-mindmap-app >nul 2>&1
docker rm ai-mindmap-app >nul 2>&1

:: 清理悬空镜像
echo 正在清理悬空镜像...
docker image prune -f

:: 构建镜像
echo 正在构建镜像...
docker build -t ai-mindmap:latest .

:: 启动容器
echo 正在启动容器...
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

if %errorLevel% equ 0 (
    echo.
    echo ================================================
    echo    部署成功！
    echo ================================================
    echo 访问地址：http://localhost:9301
    echo.
    echo 常用命令：
    echo   查看日志：docker logs ai-mindmap-app
    echo   停止容器：docker stop ai-mindmap-app
    echo   启动容器：docker start ai-mindmap-app
    echo.
    echo 按任意键打开浏览器...
    timeout /t 3 /nobreak >nul
    start http://localhost:9301
) else (
    echo 部署失败，请检查错误信息
    pause
)

pause