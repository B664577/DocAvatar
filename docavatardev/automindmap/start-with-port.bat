@echo off
echo AI思维导图本地启动工具
echo =====================
echo 当前端口: 9301 (可能被占用)
echo 请选择启动方案:
echo 1. 端口3000 (推荐)
echo 2. 端口8080
echo 3. 端口9000
echo 4. 自定义端口
set /p choice=请输入选择(1-4):

if "%choice%"=="1" set PORT=3000
if "%choice%"=="2" set PORT=8080
if "%choice%"=="3" set PORT=9000
if "%choice%"=="4" set /p PORT=请输入端口号:

echo 正在启动，使用端口: %PORT%
echo 访问地址: http://localhost:%PORT%
npm start
pause