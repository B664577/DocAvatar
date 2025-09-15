@echo off
title AI Mindmap Build Tool
echo.
echo === AI Mindmap Docker Build ===
echo.

:: Clean old containers
docker rm -f ai-mindmap-app 2>nul
docker rmi ai-mindmap:latest 2>nul

:: Build with China mirror
echo Building with China mirror...
docker build -f Dockerfile.国内镜像 -t ai-mindmap:latest .

if errorlevel 1 (
    echo Build failed, trying original Dockerfile...
    docker build -t ai-mindmap:latest .
)

echo.
echo === Running container ===
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

echo.
echo === Status ===
docker ps --filter name=ai-mindmap-app
echo.
echo Access: http://localhost:9301
pause