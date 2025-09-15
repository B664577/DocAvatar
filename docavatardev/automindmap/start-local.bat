@echo off
echo 正在启动AI思维导图应用...
echo.
echo 方案1: 使用默认端口9301（需要管理员权限）
powershell -Command "Start-Process cmd -ArgumentList '/c npm start' -Verb RunAs"
echo.
echo 方案2: 使用高端口3000（无需管理员权限）
set PORT=3000
npm start
pause