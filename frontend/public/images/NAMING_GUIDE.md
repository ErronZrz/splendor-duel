# Splendor Duel 图片命名指南

本文档详细说明了所有游戏图片的命名规范和目录结构。

## 📁 目录结构

```
frontend/public/images/
├── cards/           # 发展卡图片
│   ├── level1/      # 一级发展卡 (30张)
│   ├── level2/      # 二级发展卡 (24张)
│   ├── level3/      # 三级发展卡 (13张)
│   └── backs/       # 卡背图片 (3张)
├── gems/            # 宝石代币图片 (7张)
├── nobles/          # 贵族卡图片 (4张)
└── game/            # 其他游戏图片 (2张)
```

## 🎴 发展卡命名规则

### 一级发展卡 (level1/)
- **数量**: 30张
- **命名规则**: `{字母}{数字}.jpg`
- **字母范围**: a 到 g (7个字母)
- **数字范围**: 1 到 10
- **示例**: `a1.jpg`, `a2.jpg`, ..., `a10.jpg`, `b1.jpg`, ..., `g10.jpg`

### 二级发展卡 (level2/)
- **数量**: 24张
- **命名规则**: `{字母}{数字}.jpg`
- **字母范围**: h 到 l (5个字母)
- **数字范围**: 1 到 10
- **示例**: `h1.jpg`, `h2.jpg`, ..., `h10.jpg`, `i1.jpg`, ..., `l10.jpg`

### 三级发展卡 (level3/)
- **数量**: 13张
- **命名规则**: `{字母}{数字}.jpg`
- **字母范围**: m 到 o (3个字母)
- **数字范围**: 1 到 10
- **示例**: `m1.jpg`, `m2.jpg`, ..., `m10.jpg`, `n1.jpg`, `n2.jpg`, `n3.jpg`

### 卡背图片 (backs/)
- **数量**: 3张
- **命名规则**: `back{i}.jpg`
- **示例**: `back1.jpg`, `back2.jpg`, `back3.jpg`

## 💎 宝石图片命名规则

### 宝石代币 (gems/)
- **数量**: 7张
- **命名规则**: `{颜色}.jpg`
- **颜色列表**:
  - `white.jpg` - 白色宝石
  - `blue.jpg` - 蓝色宝石
  - `green.jpg` - 绿色宝石
  - `red.jpg` - 红色宝石
  - `black.jpg` - 黑色宝石
  - `pearl.jpg` - 珍珠宝石
  - `gold.jpg` - 黄金宝石

## 👑 贵族卡命名规则

### 贵族卡 (nobles/)
- **数量**: 4张
- **命名规则**: `noble{i}.jpg`
- **示例**: `noble1.jpg`, `noble2.jpg`, `noble3.jpg`, `noble4.jpg`

## 🎯 游戏图片命名规则

### 游戏图片 (game/)
- **数量**: 2张
- **命名规则**:
  - `goal.jpg` - 游戏目标提示卡
  - `board.jpg` - 拿取宝石的版图

## 📋 完整文件列表

### 发展卡 (67张)
```
level1/ (30张):
a1.jpg, a2.jpg, a3.jpg, a4.jpg, a5.jpg, a6.jpg, a7.jpg, a8.jpg, a9.jpg, a10.jpg
b1.jpg, b2.jpg, b3.jpg, b4.jpg, b5.jpg, b6.jpg, b7.jpg, b8.jpg, b9.jpg, b10.jpg
c1.jpg, c2.jpg, c3.jpg, c4.jpg, c5.jpg, c6.jpg, c7.jpg, c8.jpg, c9.jpg, c10.jpg
d1.jpg, d2.jpg, d3.jpg, d4.jpg, d5.jpg, d6.jpg, d7.jpg, d8.jpg, d9.jpg, d10.jpg
e1.jpg, e2.jpg, e3.jpg, e4.jpg, e5.jpg, e6.jpg, e7.jpg, e8.jpg, e9.jpg, e10.jpg
f1.jpg, f2.jpg, f3.jpg, f4.jpg, f5.jpg, f6.jpg, f7.jpg, f8.jpg, f9.jpg, f10.jpg
g1.jpg, g2.jpg, g3.jpg, g4.jpg, g5.jpg, g6.jpg, g7.jpg, g8.jpg, g9.jpg, g10.jpg

level2/ (24张):
h1.jpg, h2.jpg, h3.jpg, h4.jpg, h5.jpg, h6.jpg, h7.jpg, h8.jpg, h9.jpg, h10.jpg
i1.jpg, i2.jpg, i3.jpg, i4.jpg, i5.jpg, i6.jpg, i7.jpg, i8.jpg, i9.jpg, i10.jpg
j1.jpg, j2.jpg, j3.jpg, j4.jpg, j5.jpg, j6.jpg, j7.jpg, j8.jpg, j9.jpg, j10.jpg
k1.jpg, k2.jpg, k3.jpg, k4.jpg, k5.jpg, k6.jpg, k7.jpg, k8.jpg, k9.jpg, k10.jpg
l1.jpg, l2.jpg, l3.jpg, l4.jpg, l5.jpg, l6.jpg, l7.jpg, l8.jpg, l9.jpg, l10.jpg

level3/ (13张):
m1.jpg, m2.jpg, m3.jpg, m4.jpg, m5.jpg, m6.jpg, m7.jpg, m8.jpg, m9.jpg, m10.jpg
n1.jpg, n2.jpg, n3.jpg
o1.jpg

backs/ (3张):
back1.jpg, back2.jpg, back3.jpg
```

### 宝石 (7张)
```
gems/:
white.jpg, blue.jpg, green.jpg, red.jpg, black.jpg, pearl.jpg, gold.jpg
```

### 贵族卡 (4张)
```
nobles/:
noble1.jpg, noble2.jpg, noble3.jpg, noble4.jpg
```

### 游戏图片 (2张)
```
game/:
goal.jpg, board.jpg
```

## ⚠️ 重要注意事项

1. **文件格式**: 所有图片必须是 JPG 格式
2. **命名大小写**: 所有文件名必须使用小写字母
3. **数字格式**: 数字必须是 1-10，不是 01-10
4. **路径分隔符**: 使用正斜杠 `/` 作为路径分隔符
5. **文件扩展名**: 必须是 `.jpg`，不是 `.jpeg` 或其他格式

## 🔧 代码中的路径映射

在代码中，图片路径会自动生成：

```javascript
// 宝石图片
const gemPath = `/images/gems/${gemType}.jpg`

// 发展卡图片
const cardPath = `/images/cards/level${level}/${cardId}.jpg`

// 贵族卡图片
const noblePath = `/images/nobles/noble${nobleId}.jpg`

// 游戏图片
const goalPath = `/images/game/goal.jpg`
const boardPath = `/images/game/board.jpg`
```

## 📝 检查清单

在放置图片之前，请确认：

- [ ] 所有目录都已创建
- [ ] 文件名完全按照规范命名
- [ ] 文件格式为 JPG
- [ ] 文件名使用小写字母
- [ ] 数字范围为 1-10
- [ ] 总文件数量为 84 张 (67+7+4+2+3+1)

如果遇到任何问题，请参考本文档或联系开发团队。
