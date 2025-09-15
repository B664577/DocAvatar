@echo off
title Docker Network Fix for AI Mindmap
echo.
echo ================================================
echo    Docker Network Connection Fix Tool
echo    AI Mindmap Application - Port 9301
echo ================================================
echo.

:: Check if Docker is running
docker version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo [INFO] Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    timeout /t 15 /nobreak > nul
)

:: Create Docker config directory
if not exist "%USERPROFILE%\.docker" mkdir "%USERPROFILE%\.docker"

:: Configure Docker registry mirrors
echo [INFO] Configuring Docker registry mirrors...
(
echo {
echo   "registry-mirrors": [
echo     "https://registry.docker-cn.com",
echo     "https://docker.mirrors.ustc.edu.cn",
echo     "https://hub-mirror.c.163.com"
echo   ]
echo }
) > "%USERPROFILE%\.docker\daemon.json"

echo [INFO] Docker configuration updated.
echo [INFO] Please restart Docker Desktop manually.
echo [INFO] After restart, run: docker build -f Dockerfile.国内镜像 -t ai-mindmap:latest .
echo.
pause