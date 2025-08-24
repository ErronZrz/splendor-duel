# 发展卡功能实现说明

## 🎯 概述

根据 Splendor Duel 游戏规则，我们已经实现了完整的发展卡系统，包括所有 65 张发展卡的数据结构、费用计算、效果定义和分类管理。

## 🔧 技术实现

### 1. 数据结构

#### DevelopmentCardData 结构体
```go
type DevelopmentCardData struct {
    ID         string                    `json:"id"`         // 唯一标识符
    Level      models.CardLevel          `json:"level"`      // 等级 (1, 2, 3)
    Code       string                    `json:"code"`       // 代号 (a, b, c, d, e, f1, f2, g1, g2, h, i, j, k, l1, l2, l3, l4, m, n, o1, o2, o3)
    Color      models.GemType            `json:"color"`      // 卡牌颜色
    Cost       map[models.GemType]int   `json:"cost"`       // 费用
    Points     int                       `json:"points"`     // 分数
    Crowns     int                       `json:"crowns"`     // 皇冠数量
    Bonus      models.GemType            `json:"bonus"`      // 提供的bonus颜色
    Effects    []models.CardEffect       `json:"effects"`    // 一次性效果
    IsSpecial  bool                      `json:"isSpecial"`  // 是否为特殊卡
}
```

#### 新增的类型定义
```go
// 宝石类型
const (
    GemWhite   GemType = "white"   // 白色
    GemBlue    GemType = "blue"    // 蓝色
    GemGreen   GemType = "green"   // 绿色
    GemRed     GemType = "red"     // 红色
    GemBlack   GemType = "black"   // 黑色
    GemPearl   GemType = "pearl"   // 珍珠
    GemGold    GemType = "gold"    // 黄金
    GemGray    GemType = "gray"    // 灰色/百搭色
)

// 发展卡效果类型
const (
    ExtraToken     CardEffect = "extra_token"      // 额外token
    NewTurn        CardEffect = "new_turn"         // 新的回合
    Wildcard       CardEffect = "wildcard"         // 百搭颜色
    GetPrivilege   CardEffect = "get_privilege"    // 获取特权
    Steal          CardEffect = "steal"            // 窃取
)
```

### 2. 轮盘变换系统

#### 轮盘规则
```go
var colorWheel = [][]models.GemType{
    {GemWhite, GemBlue, GemGreen, GemRed, GemBlack},      // Z白 X蓝 C绿 V红 B黑
    {GemBlue, GemGreen, GemRed, GemBlack, GemWhite},      // Z蓝 X绿 C红 V黑 B白
    {GemGreen, GemRed, GemBlack, GemWhite, GemBlue},      // Z绿 X红 C黑 V白 B蓝
    {GemRed, GemBlack, GemWhite, GemBlue, GemGreen},      // Z红 X黑 C白 V蓝 B绿
    {GemBlack, GemWhite, GemBlue, GemGreen, GemRed},      // Z黑 X白 C蓝 V绿 B红
}
```

#### 公式解析函数
```go
func parseWheelFormula(formula string, cardColor models.GemType) map[models.GemType]int
```
- 根据卡牌颜色找到对应的轮盘位置
- 解析公式中的 Z, X, V, B 等符号
- 返回实际费用映射

## 🃏 发展卡分类

### 1. 普通卡 (Normal Cards)
- **特点**: 每张卡提供对应颜色的 bonus
- **数量**: 每种颜色 5 张，共 25 张
- **代号**: a, b, c, d, e, h, i, j, k, m, n

#### 1级普通卡 (30张)
- **a类**: 1皇冠，费用 3个特定颜色
- **b类**: 无特殊效果，费用 4种不同颜色各1个
- **c类**: 额外token效果，费用 2种颜色各2个
- **d类**: 新的回合效果，费用 2种颜色各2个 + 1珍珠
- **e类**: 1分，费用 3个+2个不同颜色

#### 2级普通卡 (24张)
- **h类**: 2分+1皇冠，费用 3种颜色各2个 + 1珍珠
- **i类**: 2分+获取特权效果，费用 4个同色 + 2个其他色
- **j类**: 1分+窃取效果，费用 4个+3个不同颜色
- **k类**: 1分+提供2个bonus，费用 5个+2个不同颜色

#### 3级普通卡 (13张)
- **m类**: 4分，费用 6个同色 + 2个+2个不同颜色
- **n类**: 3分+2皇冠，费用 5个+3个+3个不同颜色

### 2. 特殊卡 (Special Cards)
- **特点**: 提供百搭颜色或灰色，不提供具体颜色bonus
- **数量**: 不固定，共 7 张
- **代号**: f1, f2, f3, g1, g2, l1, l2, l3, l4, o1, o2, o3

#### 1级特殊卡
- **f1**: 3分，费用 4红+1珍珠
- **f2**: 1分+百搭颜色，费用 4黑+1珍珠
- **f3**: 1皇冠+百搭颜色，费用 4白+1珍珠
- **g1**: 1分+百搭颜色，费用 2白+2绿+1黑+1珍珠
- **g2**: 1分+百搭颜色，费用 2蓝+2红+1黑+1珍珠

#### 2级特殊卡
- **l1**: 5分，费用 6蓝+1珍珠
- **l2**: 2分+百搭颜色，费用 6绿+1珍珠
- **l3**: 2皇冠+百搭颜色，费用 6蓝+1珍珠
- **l4**: 2皇冠+百搭颜色，费用 6绿+1珍珠

#### 3级特殊卡
- **o1**: 6分，费用 8白
- **o2**: 3分+新的回合+百搭颜色，费用 8红
- **o3**: 3皇冠+百搭颜色，费用 8黑

## 🎮 效果系统

### 1. 永久效果
- **Bonus**: 除灰色外的卡牌提供对应颜色的 bonus
- **皇冠**: 积累皇冠帮助获取贵族和胜利
- **分数**: 来自发展卡和贵族的胜利条件

### 2. 一次性效果
- **额外token**: 购买时立即获得一个同色token
- **新的回合**: 购买后立即获得额外回合
- **百搭颜色**: 可选择已有bonus颜色之一
- **获取特权**: 获得一枚特权指示物
- **窃取**: 从对手处拿取一个token（不能是黄金）

## 🔍 查询功能

### 1. 获取所有发展卡
```go
func GetAllDevelopmentCards() []DevelopmentCardData
```

### 2. 按等级获取
```go
func GetCardsByLevel(level models.CardLevel) []DevelopmentCardData
```

### 3. 按ID获取
```go
func GetCardByID(id string) *DevelopmentCardData
```

## 📊 数据统计

### 总览
- **总数量**: 65张
- **1级卡**: 30张 (25普通 + 5特殊)
- **2级卡**: 24张 (20普通 + 4特殊)
- **3级卡**: 13张 (10普通 + 3特殊)

### 效果分布
- **额外token**: 5张 (c类)
- **新的回合**: 6张 (d类 + o2)
- **百搭颜色**: 9张 (f2, f3, g1, g2, l2, l3, l4, o2, o3)
- **获取特权**: 5张 (i类)
- **窃取**: 5张 (j类)

## 🚀 下一步计划

### 1. 完善轮盘公式解析
- 实现完整的公式字符串解析
- 支持复杂的费用计算
- 添加公式验证

### 2. 游戏逻辑集成
- 卡牌购买验证
- 效果触发机制
- 费用计算和扣除
- 卡牌翻开和补充

### 3. 前端展示
- 卡牌图片显示
- 费用可视化
- 效果说明
- 购买交互

### 4. 测试和验证
- 单元测试
- 集成测试
- 游戏平衡性验证

## 📝 注意事项

1. **轮盘公式**: 目前使用硬编码的费用，后续需要完善公式解析
2. **特殊效果**: 所有一次性效果都在购买时触发
3. **百搭颜色**: 需要玩家已有bonus才能选择
4. **费用验证**: 购买前需要验证玩家是否有足够的token
5. **卡牌补充**: 被购买的卡需要从卡堆中补充新的卡牌

## 🔗 相关文件

- `backend/internal/game/cards.go` - 发展卡数据定义
- `backend/internal/models/types.go` - 类型定义
- `frontend/src/components/GameBoard.vue` - 游戏版图显示
- `frontend/src/views/Game.vue` - 游戏主界面
