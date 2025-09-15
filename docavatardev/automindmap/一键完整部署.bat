@echo off
chcp 65001 >nul
title AI思维导图工具 - 完整一键部署

:: 设置颜色
set "RED=91"
set "GREEN=92"
set "YELLOW=93"

:: 设置窗口大小
mode con: cols=80 lines=30

echo.
echo ================================================
echo    AI思维导图工具 - 完整一键部署
echo ================================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [91m错误：需要管理员权限运行此脚本[0m
    echo.
    echo 请右键点击此脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

:: 检查操作系统版本
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
if "%VERSION%" LSS "10.0" (
    echo [91m错误：不支持的操作系统版本[0m
    echo 请使用Windows 10或更高版本
    pause
    exit /b 1
)

:: 检查Docker
:check_docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [93m未检测到Docker[0m
    choice /C YN /M "是否自动安装Docker Desktop"
    if errorlevel 2 (
        echo 请手动安装Docker Desktop后重试
        echo 下载地址：https://www.docker.com/products/docker-desktop/
        pause
        exit /b 1
    )
    goto install_docker
) else (
    echo [92mDocker已安装[0m
)

:: 检查Docker Compose
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    docker compose version >nul 2>&1
    if %errorlevel% neq 0 (
        echo [91m未检测到Docker Compose[0m
        echo 请确保Docker Desktop安装正确
        pause
        exit /b 1
    )
)

:: 检查Docker服务是否运行
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [91mDocker服务未运行[0m
    echo 正在尝试启动Docker服务...
    net start com.docker.service >nul 2>&1
    timeout /t 5 >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 (
        echo [91m无法启动Docker服务[0m
        echo 请确保Docker Desktop已启动
        pause
        exit /b 1
    )
)

echo [92mDocker环境检测完成！[0m

:: 检查Git
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [93m未检测到Git[0m
    choice /C YN /M "是否自动安装Git"
    if errorlevel 2 (
        echo 请手动安装Git后重试
        echo 下载地址：https://git-scm.com/download/win
        pause
        exit /b 1
    )
    goto install_git
) else (
    echo [92mGit已安装[0m
)

:: 检查项目文件
if not exist "docker-compose.yml" (
    echo [93m未检测到项目文件[0m
    set /p PROJECT_DIR=请输入项目目录名(默认为ai-mindmap):
    if "%PROJECT_DIR%"=="" set "PROJECT_DIR=ai-mindmap"
    
    if not exist "%PROJECT_DIR%" (
        echo 正在克隆项目...
        git clone https://github.com/your-repo/ai-mindmap.git "%PROJECT_DIR%"
        if %errorlevel% neq 0 (
            echo [91m项目克隆失败[0m
            pause
            exit /b 1
        )
    )
    cd "%PROJECT_DIR%"
    git pull
) else (
    echo [92m检测到现有项目，正在更新...[0m
    if exist ".git" (
        git pull
    )
)

:: 创建必要的目录
if not exist "uploads" mkdir uploads
if not exist "config" mkdir config

:: 设置权限
icacls uploads /grant Everyone:F /T >nul 2>&1

echo.
echo [93m正在构建Docker镜像...[0m
docker-compose build --no-cache
if %errorlevel% neq 0 (
    echo [91m错误：Docker镜像构建失败！[0m
    pause
    exit /b 1
)

echo.
echo [93m正在启动服务...[0m
docker-compose up -d
if %errorlevel% neq 0 (
    echo [91m错误：服务启动失败！[0m
    pause
    exit /b 1
)

echo.
echo [93m等待服务启动...[0m
timeout /t 10 >nul

:: 检查服务状态
curl -f http://localhost:3000/health >nul 2>&1
if %errorlevel% equ 0 (
    echo [92m===============================================[0m
    echo [92m   服务启动成功！[0m
    echo [92m===============================================[0m
    echo.
    echo 访问地址：[92mhttp://localhost:3000[0m
    echo.
    echo 常用命令：
    echo   查看日志：docker-compose logs -f
    echo   停止服务：docker-compose down
    echo   重启服务：docker-compose restart
    echo   查看状态：docker-compose ps
    echo.
) else (
    echo [91m警告：服务可能未正常启动[0m
    echo 请检查日志：docker-compose logs
)

echo [92m部署完成！[0m
pause
goto end

:: 安装Docker的函数
:install_docker
echo 正在下载Docker Desktop...
powershell -Command "Invoke-WebRequest -Uri 'https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe' -OutFile 'DockerDesktopInstaller.exe'"
if %errorlevel% neq 0 (
    echo [91m下载Docker失败[0m
    pause
    exit /b 1
)

echo 正在安装Docker Desktop...
start /wait DockerDesktopInstaller.exe install --quiet
if %errorlevel% neq 0 (
    echo [91m安装Docker失败[0m
    pause
    exit /b 1
)

del DockerDesktopInstaller.exe
echo [92mDocker Desktop安装完成！[0m
echo 请重启电脑后重新运行此脚本
pause
exit /b 1

:: 安装Git的函数
:install_git
echo 正在下载Git...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe' -OutFile 'GitInstaller.exe'"
if %errorlevel% neq 0 (
    echo [91m下载Git失败[0m
    pause
    exit /b 1
)

echo 正在安装Git...
start /wait GitInstaller.exe /VERYSILENT /NORESTART
if %errorlevel% neq 0 (
    echo [91m安装Git失败[0m
    pause
    exit /b 1
)

del GitInstaller.exe
echo [92mGit安装完成！[0m
echo 请重新运行此脚本
pause
exit /b 1

:end