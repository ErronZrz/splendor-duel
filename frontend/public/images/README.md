# 图片资源目录

请将 Splendor Duel 的图片资源放在以下目录中：

## 目录结构

```
images/
├── cards/           # 发展卡图片
│   ├── level1/      # 一级发展卡 (30张: a 到 g)
│   ├── level2/      # 二级发展卡 (24张: h 到 l)
│   ├── level3/      # 三级发展卡 (13张: m 到 o)
│   └── backs/       # 卡背图片 (3张: back1.jpg, back2.jpg, back3.jpg)
├── gems/            # 宝石代币图片 (7张)
│   ├── white.jpg    # 白色宝石
│   ├── blue.jpg     # 蓝色宝石
│   ├── green.jpg    # 绿色宝石
│   ├── red.jpg      # 红色宝石
│   ├── black.jpg    # 黑色宝石
│   ├── pearl.jpg    # 珍珠宝石
│   └── gold.jpg     # 黄金宝石
├── nobles/          # 贵族卡图片 (4张)
│   ├── noble1.jpg
│   ├── noble2.jpg
│   ├── noble3.jpg
│   └── noble4.jpg
└── game/            # 其他游戏图片
    ├── goal.jpg     # 游戏目标提示卡
    └── board.jpg    # 拿取宝石的版图
```

## 图片要求

- 格式：JPG 或 PNG
- 大小：每张卡牌约 70KB，宝石约 30KB
- 分辨率：建议卡牌 300x400px，宝石 100x100px
- 命名：使用英文小写和数字，用下划线分隔

## 注意事项

1. 确保图片文件名与代码中的路径匹配
2. 图片应该是透明背景或白色背景
3. 保持图片质量的同时控制文件大小
4. 建议使用 WebP 格式以获得更好的压缩效果
