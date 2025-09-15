@echo off
chcp 65001 >nul
title AI思维导图工具 - Docker一键部署

echo.
echo ================================================
echo    AI思维导图工具 - Docker一键部署
echo ================================================
echo.

:: 检查Docker是否已安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未检测到Docker！
    echo.
    echo 请访问 https://www.docker.com/products/docker-desktop/ 下载并安装Docker Desktop
    echo 安装完成后请重新运行此文件
    pause
    exit /b 1
)

:: 检查Docker Compose是否已安装
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未检测到Docker Compose！
    echo.
    echo 请确保Docker Desktop安装正确
    pause
    exit /b 1
)

echo Docker环境检测完成！
echo.

:: 构建并启动容器
echo 正在构建Docker镜像...
docker-compose build --no-cache
if %errorlevel% neq 0 (
    echo 错误：Docker镜像构建失败！
    pause
    exit /b 1
)

echo.
echo 正在启动服务...
docker-compose up -d
if %errorlevel% neq 0 (
    echo 错误：服务启动失败！
    pause
    exit /b 1
)

echo.
echo ================================================
echo    服务启动成功！
echo ================================================
echo.
echo 访问地址：http://localhost:3000
echo.
echo 查看日志：docker-compose logs -f
echo 停止服务：docker-compose down
echo.
echo 按任意键退出...
pause