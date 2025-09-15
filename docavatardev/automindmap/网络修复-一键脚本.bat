@echo off
title Docker网络修复脚本 - AI思维导图
chcp 65001 > nul
color 0A

echo.
echo ╔═══════════════════════════════════════════════╗
echo ║         Docker网络连接问题修复工具            ║
echo ║                 AI思维导图                    ║
echo ╚═══════════════════════════════════════════════╝
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 需要管理员权限来修改网络配置！
    echo [提示] 右键以管理员身份运行此脚本
    pause
    exit /b 1
)

:: 检查Docker状态
echo [步骤1/4] 检查Docker状态...
docker version >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker未运行，正在启动...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    timeout /t 15 /nobreak > nul
)

:: 修复网络配置
echo [步骤2/4] 修复网络配置...
echo [提示] 配置DNS和代理设置...

:: 设置Docker配置
set docker_config=%USERPROFILE%\.docker\daemon.json
echo {
    "registry-mirrors": [
        "https://registry.docker-cn.com",
        "https://docker.mirrors.ustc.edu.cn",
        "https://hub-mirror.c.163.com",
        "https://mirror.baidubce.com"
    ],
    "dns": ["8.8.8.8", "8.8.4.4", "114.114.114.114"],
    "max-concurrent-downloads": 10,
    "max-concurrent-uploads": 5,
    "experimental": false,
    "features": {
        "buildkit": true
    }
} > "%docker_config%"

echo [步骤3/4] 重启Docker服务...
powershell -Command "
    Write-Host '正在重启Docker...' -ForegroundColor Yellow
    Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep 3
    Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
    Write-Host 'Docker已重启' -ForegroundColor Green
"

echo [步骤4/4] 测试网络连接...
timeout /t 10 /nobreak > nul

echo [测试] 测试Docker Hub连接...
docker pull hello-world >nul 2>&1
if errorlevel 1 (
    echo [警告] 网络连接仍有问题，使用国内镜像构建...
    
    :: 创建使用国内镜像的构建脚本
    echo [提示] 使用国内镜像源重新构建...
    if exist "Dockerfile.国内镜像" (
        docker build -f Dockerfile.国内镜像 -t ai-mindmap:latest .
    ) else (
        echo [错误] 未找到国内镜像Dockerfile
    )
) else (
    echo [成功] 网络连接正常！
    if exist "Dockerfile" (
        docker build -t ai-mindmap:latest .
    )
)

echo.
echo ╔═══════════════════════════════════════════════╗
echo ║              修复完成！                       ║
echo ║  现在可以尝试运行容器：                      ║
echo ║  docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest ║
echo ╚═══════════════════════════════════════════════╝
echo.
pause