@echo off
echo.
echo === AI Mindmap Docker Setup ===
echo.

:: Check Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo Docker not found. Install Docker Desktop first.
    pause
    exit /b 1
)

:: Clean up
docker stop ai-mindmap-app 2>nul
docker rm ai-mindmap-app 2>nul

:: Build and run
echo Building...
docker build -f Dockerfile.国内镜像 -t ai-mindmap:latest .

echo Starting...
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

echo Done! Visit: http://localhost:9301
pause