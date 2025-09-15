@echo off
chcp 65001 > nul
title Docker网络修复与部署工具 - AI思维导图
setlocal enabledelayedexpansion

echo.
echo ================================================
echo    AI思维导图 Docker网络修复与部署工具
echo    解决网络连接问题并部署到9301端口
echo ================================================
echo.

:: 检查Docker是否运行
powershell -Command "if (-not (Get-Process 'com.docker.proxy' -ErrorAction SilentlyContinue)) { exit 1 }"
if errorlevel 1 (
    echo [错误] Docker Desktop未运行！请先启动Docker Desktop
    pause
    exit /b 1
)

:: 配置Docker镜像加速器
set config_file=%USERPROFILE%\.docker\daemon.json
set temp_config=%USERPROFILE%\.docker\daemon_temp.json

if not exist "%USERPROFILE%\.docker" mkdir "%USERPROFILE%\.docker"

echo [步骤1/6] 配置Docker镜像加速器...
if exist "%config_file%" (
    :: 备份原始配置
    copy "%config_file%" "%config_file%.backup" > nul
    echo [提示] 已备份原始配置文件到 daemon.json.backup
)

:: 创建或更新配置文件
(
echo {
echo   "registry-mirrors": [
echo     "https://registry.docker-cn.com",
echo     "https://docker.mirrors.ustc.edu.cn",
echo     "https://hub-mirror.c.163.com",
echo     "https://mirror.baidubce.com",
echo     "https://ccr.ccs.tencentyun.com"
echo   ],
echo   "max-concurrent-downloads": 10,
echo   "max-concurrent-uploads": 5,
echo   "experimental": false
echo }
) > "%config_file%"

echo [提示] 已配置国内镜像加速器，重启Docker生效...

:: 重启Docker服务
echo [步骤2/6] 重启Docker服务...
powershell -Command "
    Write-Host '正在重启Docker服务...' -ForegroundColor Yellow
    try {
        Stop-Process -Name 'Docker Desktop' -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
        Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
        Write-Host 'Docker Desktop已重启' -ForegroundColor Green
    } catch {
        Write-Host '重启Docker Desktop时出错，请手动重启' -ForegroundColor Red
    }
"

echo [提示] 等待Docker服务启动...
timeout /t 10 /nobreak > nul

:: 清理旧容器和镜像
echo [步骤3/6] 清理旧容器和镜像...
docker rm -f ai-mindmap-app 2>nul
docker rmi ai-mindmap:latest 2>nul

:: 构建镜像
echo [步骤4/6] 构建Docker镜像...
echo [提示] 使用国内镜像源构建...

:: 创建临时Dockerfile使用国内镜像源
set temp_dockerfile=Dockerfile.temp
(
echo # 使用国内镜像源
if exist "Dockerfile" (
    type "Dockerfile" | findstr /v "FROM" | findstr /v "node"
    echo FROM registry.cn-hangzhou.aliyuncs.com/aliyun-node/alpine-node:18
) else (
    echo FROM registry.cn-hangzhou.aliyuncs.com/aliyun-node/alpine-node:18
    echo WORKDIR /app
    echo COPY package*.json ./
    echo RUN npm config set registry https://registry.npmmirror.com && npm ci --only=production
    echo COPY . .
    echo RUN mkdir -p uploads config logs && chmod -R 755 uploads config logs
    echo EXPOSE 9301
    echo HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD curl -f http://localhost:9301/health || exit 1
    echo CMD ["node", "server.js"]
)
) > "%temp_dockerfile%"

:: 尝试构建
docker build -f "%temp_dockerfile%" -t ai-mindmap:latest . --no-cache
if errorlevel 1 (
    echo [警告] 国内镜像构建失败，尝试使用原始镜像...
    if exist "Dockerfile" (
        docker build -t ai-mindmap:latest .
    ) else (
        echo [错误] 未找到Dockerfile文件
        pause
        exit /b 1
    )
)

:: 清理临时文件
if exist "%temp_dockerfile%" del "%temp_dockerfile%"

:: 启动容器
echo [步骤5/6] 启动容器...
docker run -d --name ai-mindmap-app -p 9301:9301 -v "%cd%\uploads:/app/uploads" -v "%cd%\config:/app/config" -v "%cd%\logs:/app/logs" --restart unless-stopped ai-mindmap:latest

if errorlevel 1 (
    echo [错误] 容器启动失败！
    pause
    exit /b 1
)

:: 验证部署
echo [步骤6/6] 验证部署...
timeout /t 5 /nobreak > nul

echo.
echo [检查] 容器状态:
docker ps --filter name=ai-mindmap-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo.
echo [检查] 镜像信息:
docker images ai-mindmap:latest --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo.
echo [检查] 健康检查:
curl -s http://localhost:9301/health || echo [警告] 健康检查端点暂时不可用

echo.
echo ================================================
echo    部署完成！
echo    应用地址: http://localhost:9301
echo    健康检查: http://localhost:9301/health
echo    上传目录: %cd%\uploads
echo    日志目录: %cd%\logs
echo ================================================
echo.
echo [常用命令]
echo 查看日志: docker logs -f ai-mindmap-app
echo 停止容器: docker stop ai-mindmap-app
echo 启动容器: docker start ai-mindmap-app
echo 重启容器: docker restart ai-mindmap-app
echo 进入容器: docker exec -it ai-mindmap-app sh
echo.
pause