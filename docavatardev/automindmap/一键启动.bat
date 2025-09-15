@echo off
chcp 65001 >nul
title AI思维导图工具 - 一键启动

echo.
echo ================================================
echo    AI思维导图工具 - 一键启动
echo ================================================
echo.

:: 检查Node.js是否已安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未检测到Node.js！
    echo.
    echo 请访问 https://nodejs.org/ 下载并安装Node.js
    echo 安装完成后请重新运行此文件
    pause
    exit /b 1
)

:: 检查npm是否已安装
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误：未检测到npm！
    echo.
    echo 请确保Node.js安装正确
    pause
    exit /b 1
)

echo 正在检查依赖...

:: 检查package.json是否存在
if not exist "package.json" (
    echo 错误：未找到package.json文件！
    echo 请确保在正确的目录中运行此文件
    pause
    exit /b 1
)

:: 安装依赖
echo 正在安装项目依赖...
call npm install
if %errorlevel% neq 0 (
    echo 错误：依赖安装失败！
    pause
    exit /b 1
)

echo.
echo 依赖安装完成！
echo.

:: 启动服务
echo 正在启动AI思维导图服务...
echo.
echo 服务启动后，浏览器将自动打开 http://localhost:3000
echo.
echo 按任意键停止服务...
echo.

:: 启动服务器
start "" http://localhost:3000
node server.js

pause