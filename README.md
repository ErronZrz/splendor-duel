# Splendor Duel Web 应用

一个基于 Vue 3 和 Go 的在线 Splendor Duel 桌游应用，支持实时多人对战。

## 项目特性

- 🎮 **完整游戏规则**：严格按照官方 Splendor Duel 规则实现
- 🌐 **实时对战**：基于 WebSocket 的实时通信
- 💬 **聊天功能**：玩家间实时交流
- 📊 **操作历史**：记录所有游戏操作
- 🎨 **现代 UI**：响应式设计，支持移动端
- ⚡ **高性能**：Go 后端，Vue 3 前端
- 🧹 **自动清理**：24小时后自动清理过期房间

## 技术栈

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **Composition API** - Vue 3 的组合式 API
- **Pinia** - Vue 状态管理
- **Vue Router** - 官方路由管理器
- **Vite** - 快速构建工具

### 后端
- **Go** - 高性能编程语言
- **Gin** - HTTP Web 框架
- **Gorilla WebSocket** - WebSocket 实现
- **UUID** - 唯一标识符生成

## 快速开始

### 前置要求

- Node.js 16+ 
- Go 1.21+
- 现代浏览器

### 安装依赖

#### 前端
```bash
cd frontend
npm install
```

#### 后端
```bash
cd backend
go mod tidy
```

### 启动应用

#### 后端
```bash
cd backend
go run cmd/main.go
```
后端将在 `http://localhost:8080` 启动

#### 前端
```bash
cd frontend
npm run dev
```
前端将在 `http://localhost:3000` 启动

### 访问应用

打开浏览器访问 `http://localhost:3000`

## 游戏玩法

1. **创建房间**：输入房间名称和玩家名称
2. **等待玩家**：等待其他玩家加入
3. **开始游戏**：两名玩家到齐后开始游戏
4. **收集宝石**：每回合可以拿取宝石或购买发展卡
5. **获得胜利**：通过声望点数或特定发展卡组合获胜

## 项目结构

```
splendor-duel/
├── frontend/          # Vue 3 前端
│   ├── public/        # 静态资源
│   │   └── images/    # 游戏图片资源
│   ├── src/
│   │   ├── components/ # Vue 组件
│   │   ├── views/      # 页面视图
│   │   ├── stores/     # Pinia 状态管理
│   │   └── router/     # 路由配置
│   └── package.json
├── backend/           # Go 后端
│   ├── cmd/           # 主程序入口
│   ├── internal/      # 内部包
│   │   ├── game/      # 游戏逻辑
│   │   ├── websocket/ # WebSocket 处理
│   │   └── models/    # 数据模型
│   └── go.mod
└── README.md
```

## 图片资源

请将 Splendor Duel 的图片资源放在 `frontend/public/images/` 目录中，具体结构请参考 `frontend/public/images/README.md`。

## API 接口

### 房间管理
- `POST /api/rooms` - 创建房间
- `POST /api/rooms/join` - 加入房间
- `GET /api/rooms/:roomId` - 获取房间信息

### WebSocket
- `GET /ws/:roomId` - WebSocket 连接

## 开发说明

### 添加新功能
1. 在前端 `stores/game.js` 中添加状态和方法
2. 在后端 `internal/game/` 中添加游戏逻辑
3. 在 `internal/websocket/` 中处理实时通信

### 游戏规则修改
在 `internal/models/types.go` 中修改数据结构，在 `internal/game/manager.go` 中修改游戏逻辑。

## 部署

### 生产环境
1. 构建前端：`npm run build`
2. 编译后端：`go build -o server cmd/main.go`
3. 配置反向代理（Nginx/Apache）
4. 设置环境变量

### Docker 部署
```bash
# 构建镜像
docker build -t splendor-duel .

# 运行容器
docker run -p 8080:8080 splendor-duel
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 致谢

- Splendor Duel 游戏设计者
- Vue.js 和 Go 社区
- 所有贡献者