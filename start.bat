@echo off
echo 启动 Splendor Duel Web 应用...
echo.

echo 正在启动后端服务...
start "Backend" cmd /k "cd backend && go run cmd/main.go"

echo 等待后端启动...
timeout /t 3 /nobreak > nul

echo 正在启动前端服务...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo 应用启动完成！
echo 前端: http://localhost:3000
echo 后端: http://localhost:8080
echo.
echo 按任意键退出...
pause > nul
