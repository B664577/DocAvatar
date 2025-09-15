@echo off
chcp 65001 >nul
title AI思维导图 - Docker部署修复工具
color 0A

echo.
echo ================================================
echo    AI思维导图 - Docker部署修复工具
necho ================================================
echo.

:: 检查Docker状态
echo 正在检查Docker状态...
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
    timeout /t 10 /nobreak >nul
)

:: 清理旧容器和镜像
echo 正在清理旧容器和镜像...
docker stop ai-mindmap-app >nul 2>&1
docker rm ai-mindmap-app >nul 2>&1
docker rmi ai-mindmap:latest >nul 2>&1

:: 清理悬空镜像
echo 正在清理悬空镜像...
docker image prune -f
docker container prune -f

:: 构建新镜像
echo 正在构建新镜像...
echo 构建日志将显示在下方...
docker build -t ai-mindmap:latest .

if %errorLevel% neq 0 (
    echo 镜像构建失败！
    echo 请检查Dockerfile和项目文件
    pause
    exit /b 1
)

echo.
echo 镜像构建成功！
echo.

:: 运行新容器
echo 正在启动容器...
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

if %errorLevel% neq 0 (
    echo 容器启动失败！
    echo 请检查端口9301是否被占用
    pause
    exit /b 1
)

echo.
echo ================================================
echo    部署成功！
echo ================================================
echo 容器名称：ai-mindmap-app
echo 访问地址：http://localhost:9301
echo 端口映射：9301 -> 9301
echo.

:: 验证部署
echo 正在验证部署...
timeout /t 5 /nobreak >nul

echo.
echo 容器状态：
docker ps --filter name=ai-mindmap-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo 镜像信息：
docker images ai-mindmap:latest --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo.
echo 健康检查：
curl -I http://localhost:9301 2>nul | findstr "HTTP" >nul
if %errorLevel% equ 0 (
    echo ✅ 服务正常运行！
    echo.
    echo 按任意键打开浏览器访问...
    pause >nul
    start http://localhost:9301
) else (
    echo ⚠️  服务可能还在启动中...
    echo 请稍等30秒后手动访问：http://localhost:9301
    echo.
    echo 查看日志：docker logs ai-mindmap-app
    pause
)

echo.
echo 常用命令：
echo   查看日志：docker logs -f ai-mindmap-app
echo   停止容器：docker stop ai-mindmap-app
echo   启动容器：docker start ai-mindmap-app
echo   进入容器：docker exec -it ai-mindmap-app sh
echo   删除容器：docker rm -f ai-mindmap-app
echo   删除镜像：docker rmi ai-mindmap:latest