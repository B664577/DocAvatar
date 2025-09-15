@echo off
chcp 65001 >nul
title AI思维导图 - 一键安装

:: 设置窗口颜色
color 0A

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：需要管理员权限运行！
    echo 请右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════╗
echo ║        AI思维导图一键安装程序            ║
echo ╚══════════════════════════════════════════╝
echo.

:: 设置变量
set "NODE_VERSION=18.17.0"
set "PROJECT_DIR=%~dp0"
set "LOG_FILE=%PROJECT_DIR%install.log"

:: 创建日志文件
echo [%date% %time%] 开始安装 > "%LOG_FILE%"

:: 检查Node.js
echo 1. 检查Node.js环境...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo    未检测到Node.js，开始安装...
    goto :InstallNode
) else (
    echo    Node.js已安装
    node --version
    goto :CheckNpm
)

:InstallNode
echo    正在下载Node.js %NODE_VERSION%...
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v%NODE_VERSION%/node-v%NODE_VERSION%-x64.msi' -OutFile '%TEMP%\node-v%NODE_VERSION%-x64.msi'"
if %errorLevel% neq 0 (
    echo    下载失败，请检查网络连接
    pause
    exit /b 1
)

echo    正在安装Node.js...
msiexec /i "%TEMP%\node-v%NODE_VERSION%-x64.msi" /quiet /norestart
if %errorLevel% neq 0 (
    echo    Node.js安装失败
    pause
    exit /b 1
)

:: 等待安装完成
timeout /t 10 /nobreak >nul

:: 刷新环境变量
call :RefreshEnv

echo    Node.js安装完成！

:CheckNpm
echo.
echo 2. 检查npm...
npm --version
if %errorLevel% neq 0 (
    echo    npm未检测到，请重新安装Node.js
    pause
    exit /b 1
)

:: 安装项目依赖
echo.
echo 3. 安装项目依赖...
cd /d "%PROJECT_DIR%"
if exist "package.json" (
    echo    正在安装依赖包...
    call npm install --production
    if %errorLevel% neq 0 (
        echo    依赖安装失败，尝试清理缓存...
        call npm cache clean --force
        call npm install --production
    )
) else (
    echo    错误：未找到package.json文件
    pause
    exit /b 1
)

:: 创建必要目录
echo.
echo 4. 创建必要目录...
if not exist "uploads" mkdir uploads
if not exist "logs" mkdir logs
if not exist "config" mkdir config

:: 检查端口占用
echo.
echo 5. 检查端口9301...
netstat -ano | findstr :9301 >nul
if %errorLevel% equ 0 (
    echo    警告：端口9301已被占用
    echo    将使用端口9302
    set "PORT=9302"
) else (
    set "PORT=9301"
)

:: 创建启动脚本
echo.
echo 6. 创建启动脚本...
echo @echo off > start-server.bat
echo title AI思维导图服务器 >> start-server.bat
echo cd /d "%~dp0" >> start-server.bat
echo echo 正在启动AI思维导图服务器... >> start-server.bat
echo node server.js >> start-server.bat
echo pause >> start-server.bat

:: 创建桌面快捷方式
echo.
echo 7. 创建桌面快捷方式...
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\AI思维导图.lnk"

powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT%'); $Shortcut.TargetPath = '%PROJECT_DIR%start-server.bat'; $Shortcut.WorkingDirectory = '%PROJECT_DIR%'; $Shortcut.IconLocation = '%SYSTEMROOT%\System32\shell32.dll,21'; $Shortcut.Save()"

:: 添加到防火墙白名单
echo.
echo 8. 配置防火墙...
netsh advfirewall firewall add rule name="AI思维导图" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1

:: 启动服务
echo.
echo 9. 启动AI思维导图服务器...
echo 正在启动服务器...
cd /d "%PROJECT_DIR%"
start "" node server.js

:: 等待启动
timeout /t 3 /nobreak >nul

:: 检查服务是否启动成功
curl -I http://localhost:%PORT% >nul 2>&1
if %errorLevel% equ 0 (
    echo.
    echo ╔══════════════════════════════════════════╗
    echo ║              安装成功！                  ║
    echo ╚══════════════════════════════════════════╝
    echo.
    echo 访问地址：http://localhost:%PORT%
    echo.
    echo 桌面已创建快捷方式：AI思维导图.lnk
    echo.
    echo 按任意键打开浏览器访问...
    pause >nul
    start http://localhost:%PORT%
) else (
    echo.
    echo 服务器启动失败，请检查日志...
    pause
)

exit /b 0

:RefreshEnv
:: 刷新环境变量
setx PATH "%PATH%" >nul 2>&1
for /f "tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "PATH=%%B"
for /f "tokens=2,*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "PATH=%PATH%;%%B"
goto :eof

:ErrorHandler
echo 发生错误：%1
pause
exit /b 1