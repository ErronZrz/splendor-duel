#!/bin/bash

echo "启动 Splendor Duel Web 应用..."
echo

echo "正在启动后端服务..."
cd backend
go run cmd/main.go &
BACKEND_PID=$!
cd ..

echo "等待后端启动..."
sleep 3

echo "正在启动前端服务..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo
echo "应用启动完成！"
echo "前端: http://localhost:3000"
echo "后端: http://localhost:8080"
echo
echo "按 Ctrl+C 停止所有服务..."

# 等待用户中断
trap "echo '正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
