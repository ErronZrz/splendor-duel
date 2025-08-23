# Splendor Duel 快速设置指南

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone <your-repo-url>
cd splendor-duel
```

### 2. 安装依赖

#### 前端依赖
```bash
cd frontend
npm install
```

#### 后端依赖
```bash
cd backend
go mod tidy
```

### 3. 添加图片资源

#### 方法一：使用脚本自动创建目录（推荐）

**Windows 用户：**
```bash
create_image_dirs.bat
```

**Linux/Mac 用户：**
```bash
./create_image_dirs.sh
```

#### 方法二：手动创建目录

将你的 Splendor Duel 图片资源放在以下目录，**必须按照指定的命名规则**：

```
frontend/public/images/
├── cards/
│   ├── level1/      # 30张一级发展卡 (a1.jpg 到 g10.jpg)
│   ├── level2/      # 24张二级发展卡 (h1.jpg 到 l10.jpg)
│   ├── level3/      # 13张三级发展卡 (m1.jpg 到 o10.jpg)
│   └── backs/       # 3张卡背 (back1.jpg, back2.jpg, back3.jpg)
├── gems/            # 7种宝石 (white.jpg, blue.jpg, green.jpg, red.jpg, black.jpg, pearl.jpg, gold.jpg)
├── nobles/          # 4张贵族卡 (noble1.jpg, noble2.jpg, noble3.jpg, noble4.jpg)
└── game/            # 游戏目标提示卡 (goal.jpg) 和宝石版图 (board.jpg)
```

**⚠️ 重要**: 请查看 `frontend/public/images/NAMING_GUIDE.md` 了解详细的命名规则！

### 4. 启动应用

#### 方法一：使用启动脚本（推荐）

**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

#### 方法二：手动启动

**启动后端：**
```bash
cd backend
go run cmd/main.go
```

**启动前端（新终端）：**
```bash
cd frontend
npm run dev
```

### 5. 访问应用

打开浏览器访问：`http://localhost:3000`

## 📁 项目结构

```
splendor-duel/
├── frontend/          # Vue 3 前端
│   ├── public/        # 静态资源
│   ├── src/           # 源代码
│   └── package.json   # 前端依赖
├── backend/           # Go 后端
│   ├── cmd/           # 主程序
│   ├── internal/      # 内部包
│   └── go.mod         # Go 模块
├── start.bat          # Windows 启动脚本
├── start.sh           # Linux/Mac 启动脚本
└── README.md          # 项目说明
```

## 🎮 游戏功能

- ✅ 房间创建和加入
- ✅ 实时 WebSocket 通信
- ✅ 聊天功能
- ✅ 操作历史记录
- ✅ 响应式 UI 设计
- ✅ 24小时自动清理

## 🔧 开发模式

### 前端开发
```bash
cd frontend
npm run dev          # 开发服务器
npm run build        # 构建生产版本
npm run preview      # 预览构建结果
```

### 后端开发
```bash
cd backend
go run cmd/main.go   # 运行开发服务器
go build cmd/main.go # 构建可执行文件
```

## 🌐 端口配置

- **前端**: 3000 (http://localhost:3000)
- **后端**: 8080 (http://localhost:8080)
- **WebSocket**: ws://localhost:8080/ws/{roomId}

## 📱 浏览器支持

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 🐛 常见问题

### Q: 前端无法连接后端？
A: 确保后端在 8080 端口运行，检查 CORS 设置

### Q: WebSocket 连接失败？
A: 检查防火墙设置，确保 WebSocket 端口开放

### Q: 图片无法显示？
A: 检查图片路径和文件名是否与代码匹配

### Q: 游戏无法开始？
A: 确保两名玩家都已加入房间

## 📞 技术支持

如果遇到问题，请：
1. 检查控制台错误信息
2. 查看 README.md 文档
3. 提交 Issue 到项目仓库

## 🎯 下一步

- [ ] 完善游戏规则逻辑
- [ ] 添加 AI 对手
- [ ] 实现游戏回放功能
- [ ] 添加音效和动画
- [ ] 优化移动端体验
