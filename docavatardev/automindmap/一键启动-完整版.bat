@echo off
title AI思维导图工具 - 一键完整部署
color 0A

echo.
echo ================================================
echo    AI思维导图工具 - 一键完整部署
echo ================================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：需要管理员权限运行此脚本
    echo.
    echo 正在以管理员身份重新运行...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: 检查Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装Docker Desktop...
    powershell -Command "Invoke-WebRequest -Uri 'https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe' -OutFile '%TEMP%\DockerDesktopInstaller.exe'; Start-Process -FilePath '%TEMP%\DockerDesktopInstaller.exe' -ArgumentList 'install', '--quiet' -Wait; Remove-Item '%TEMP%\DockerDesktopInstaller.exe' -Force"
    echo Docker Desktop安装完成！请重启电脑后重新运行此脚本。
    pause
    exit /b 1
)

:: 检查Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装Git...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe' -OutFile '%TEMP%\GitInstaller.exe'; Start-Process -FilePath '%TEMP%\GitInstaller.exe' -ArgumentList '/VERYSILENT', '/NORESTART' -Wait; Remove-Item '%TEMP%\GitInstaller.exe' -Force"
    echo Git安装完成！
)

:: 启动Docker服务
net start com.docker.service >nul 2>&1

:: 构建和启动
echo 正在构建和启动服务...
docker-compose build --no-cache && docker-compose up -d

if %errorlevel% equ 0 (
    echo.
    echo ================================================
    echo    部署成功！
    echo ================================================
    echo 访问地址：http://localhost:9301
    echo.
    echo 常用命令：
    echo   查看日志：docker-compose logs -f
    echo   停止服务：docker-compose down
    echo   重启服务：docker-compose restart
) else (
    echo 部署失败，请检查错误信息
)

pause