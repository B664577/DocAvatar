@echo off
chcp 65001 >nul
echo ======================================
echo Docker连接修复工具
echo ======================================

echo 正在检查Docker Desktop状态...
tasklist /FI "IMAGENAME eq Docker Desktop.exe" | find /I "Docker Desktop.exe" >nul
if %errorlevel% neq 0 (
    echo Docker Desktop未运行，正在启动...
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
    echo 已启动Docker Desktop，请等待30秒...
    timeout /t 30 /nobreak >nul
) else (
    echo Docker Desktop已在运行
)

echo 正在重启Docker服务...
net stop com.docker.service >nul 2>&1
net start com.docker.service >nul 2>&1

echo 正在检查Docker连接...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker仍无法连接，请手动重启Docker Desktop
    echo 步骤：
    echo 1. 右键点击系统托盘中的Docker图标
    echo 2. 选择"Restart Docker Desktop"
    echo 3. 等待Docker完全启动后重试
    pause
    exit /b 1
) else (
    echo Docker连接已恢复正常！
    echo 现在可以运行Docker命令了
)

echo 按任意键继续...
pause