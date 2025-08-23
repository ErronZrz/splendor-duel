package game

import (
	"fmt"
	"splendor-duel-backend/internal/models"
	"strconv"
	"strings"
)

// DevelopmentCardData 发展卡数据
type DevelopmentCardData struct {
	ID       string                    `json:"id"`
	Level    models.CardLevel          `json:"level"`
	Code     string                    `json:"code"`      // 代号，如 a, b, c, d, e, f1, f2, g1, g2, h, i, j, k, l1, l2, l3, l4, m, n, o1, o2, o3
	Color    models.GemType            `json:"color"`    // 卡牌颜色（对于普通卡，这是bonus颜色；对于特殊卡，这是百搭色或灰色）
	Cost     map[models.GemType]int    `json:"cost"`     // 费用
	Points   int                       `json:"points"`   // 分数
	Crowns   int                       `json:"crowns"`   // 皇冠数量
	Bonus    models.GemType            `json:"bonus"`    // 提供的bonus颜色（灰色卡为"gray"）
	Effects  []models.CardEffect       `json:"effects"`  // 一次性效果
	IsSpecial bool                     `json:"isSpecial"` // 是否为特殊卡
}

// 轮盘变换规则 - Z白 X蓝 C绿 V红 B黑
var colorWheel = [][]models.GemType{
	{models.GemWhite, models.GemBlue, models.GemGreen, models.GemRed, models.GemBlack},      // Z白 X蓝 C绿 V红 B黑
	{models.GemBlue, models.GemGreen, models.GemRed, models.GemBlack, models.GemWhite},      // Z蓝 X绿 C红 V黑 B白
	{models.GemGreen, models.GemRed, models.GemBlack, models.GemWhite, models.GemBlue},      // Z绿 X红 C黑 V白 B蓝
	{models.GemRed, models.GemBlack, models.GemWhite, models.GemBlue, models.GemGreen},      // Z红 X黑 C白 V蓝 V绿
	{models.GemBlack, models.GemWhite, models.GemBlue, models.GemGreen, models.GemRed},      // Z黑 X白 C蓝 V绿 B红
}

// 普通卡的轮盘公式映射
var normalCardFormulas = map[string]string{
	// 1级普通卡
	"a": "3V",
	"b": "1Z 1X 1V 1B",
	"c": "2Z 2X",
	"d": "2V 2B 1P",
	"e": "3Z 2B",
	
	// 2级普通卡
	"h": "2X 2V 2B 1P",
	"i": "4C 2X 1P",
	"j": "4V 3Z",
	"k": "5V 2B",
	
	// 3级普通卡
	"m": "6C 2X 2V",
	"n": "5Z 3X 3V 1P",
}

// 普通卡的属性配置
var normalCardConfigs = map[string]struct {
	Level   models.CardLevel
	Points  int
	Crowns  int
	Effects []models.CardEffect
}{
	// 1级普通卡
	"a": {Level: models.Level1, Points: 0, Crowns: 1, Effects: []models.CardEffect{}},
	"b": {Level: models.Level1, Points: 0, Crowns: 0, Effects: []models.CardEffect{}},
	"c": {Level: models.Level1, Points: 0, Crowns: 0, Effects: []models.CardEffect{models.ExtraToken}},
	"d": {Level: models.Level1, Points: 0, Crowns: 0, Effects: []models.CardEffect{models.NewTurn}},
	"e": {Level: models.Level1, Points: 1, Crowns: 0, Effects: []models.CardEffect{}},
	
	// 2级普通卡
	"h": {Level: models.Level2, Points: 2, Crowns: 1, Effects: []models.CardEffect{}},
	"i": {Level: models.Level2, Points: 2, Crowns: 0, Effects: []models.CardEffect{models.GetPrivilege}},
	"j": {Level: models.Level2, Points: 1, Crowns: 0, Effects: []models.CardEffect{models.Steal}},
	"k": {Level: models.Level2, Points: 1, Crowns: 0, Effects: []models.CardEffect{}},
	
	// 3级普通卡
	"m": {Level: models.Level3, Points: 4, Crowns: 0, Effects: []models.CardEffect{}},
	"n": {Level: models.Level3, Points: 3, Crowns: 2, Effects: []models.CardEffect{}},
}

// 解析轮盘公式，返回实际费用
func parseWheelFormula(formula string, cardColor models.GemType) map[models.GemType]int {
	cost := make(map[models.GemType]int)
	
	// 找到轮盘中对应颜色的位置
	var wheelIndex int
	for i, wheel := range colorWheel {
		if wheel[2] == cardColor { // 位置C对应卡牌颜色
			wheelIndex = i
			break
		}
	}
	
	// 解析公式字符串，格式如 "3C 2X 1V 1B"
	parts := strings.Fields(formula)
	for _, part := range parts {
		if len(part) < 2 {
			continue
		}
		
		// 解析数量和颜色符号
		quantity, err := strconv.Atoi(part[:len(part)-1])
		if err != nil {
			continue
		}
		
		colorSymbol := part[len(part)-1]
		var actualColor models.GemType
		
		// 根据颜色符号和轮盘位置确定实际颜色
		switch colorSymbol {
		case 'Z':
			actualColor = colorWheel[wheelIndex][0]
		case 'X':
			actualColor = colorWheel[wheelIndex][1]
		case 'C':
			actualColor = colorWheel[wheelIndex][2] // 卡牌本身的颜色
		case 'V':
			actualColor = colorWheel[wheelIndex][3]
		case 'B':
			actualColor = colorWheel[wheelIndex][4]
		case 'P':
			actualColor = models.GemPearl // 珍珠是固定的
		default:
			continue
		}
		
		cost[actualColor] = quantity
	}
	
	return cost
}

// 生成普通卡
func generateNormalCards() []DevelopmentCardData {
	var cards []DevelopmentCardData
	
	// 颜色顺序：白、蓝、绿、红、黑
	colors := []models.GemType{models.GemWhite, models.GemBlue, models.GemGreen, models.GemRed, models.GemBlack}
	
	// 为每个普通卡类型生成5张卡（对应5种颜色）
	for code, config := range normalCardConfigs {
		for i, color := range colors {
			// 生成卡牌ID
			cardID := fmt.Sprintf("%s%d", code, i+1)
			
			// 解析轮盘公式计算费用
			formula := normalCardFormulas[code]
			cost := parseWheelFormula(formula, color)
			
			card := DevelopmentCardData{
				ID:        cardID,
				Level:     config.Level,
				Code:      code,
				Color:     color,
				Cost:      cost,
				Points:    config.Points,
				Crowns:    config.Crowns,
				Bonus:     color,
				Effects:   config.Effects,
				IsSpecial: false,
			}
			
			cards = append(cards, card)
		}
	}
	
	return cards
}

// GetAllDevelopmentCards 获取所有发展卡数据
func GetAllDevelopmentCards() []DevelopmentCardData {
	var cards []DevelopmentCardData
	
	// 生成普通卡
	cards = append(cards, generateNormalCards()...)
	
	// 添加特殊卡（固定费用，不通过轮盘公式计算）
	specialCards := []DevelopmentCardData{
		// 1级特殊卡 (f, g)
		{
			ID:       "f1", Level: models.Level1, Code: "f1", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemRed: 4, models.GemPearl: 1},
			Points:   3, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{},
		},
		{
			ID:       "f2", Level: models.Level1, Code: "f2", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemBlack: 4, models.GemPearl: 1},
			Points:   1, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},
		{
			ID:       "f3", Level: models.Level1, Code: "f3", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemWhite: 4, models.GemPearl: 1},
			Points:   0, Crowns: 1, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},

		{
			ID:       "g1", Level: models.Level1, Code: "g1", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemWhite: 2, models.GemGreen: 2, models.GemBlack: 1, models.GemPearl: 1},
			Points:   1, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},
		{
			ID:       "g2", Level: models.Level1, Code: "g2", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemBlue: 2, models.GemRed: 2, models.GemBlack: 1, models.GemPearl: 1},
			Points:   1, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},

		// 2级特殊卡 (l)
		{
			ID:       "l1", Level: models.Level2, Code: "l1", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemBlue: 6, models.GemPearl: 1},
			Points:   5, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{},
		},
		{
			ID:       "l2", Level: models.Level2, Code: "l2", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemGreen: 6, models.GemPearl: 1},
			Points:   2, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},
		{
			ID:       "l3", Level: models.Level2, Code: "l3", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemBlue: 6, models.GemPearl: 1},
			Points:   0, Crowns: 2, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},
		{
			ID:       "l4", Level: models.Level2, Code: "l4", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemGreen: 6, models.GemPearl: 1},
			Points:   0, Crowns: 2, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},

		// 3级特殊卡 (o)
		{
			ID:       "o1", Level: models.Level3, Code: "o1", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemWhite: 8},
			Points:   6, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{},
		},
		{
			ID:       "o2", Level: models.Level3, Code: "o2", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemRed: 8},
			Points:   3, Crowns: 0, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard, models.NewTurn},
		},
		{
			ID:       "o3", Level: models.Level3, Code: "o3", Color: models.GemGray, IsSpecial: true,
			Cost:     map[models.GemType]int{models.GemBlack: 8},
			Points:   0, Crowns: 3, Bonus: models.GemGray,
			Effects:  []models.CardEffect{models.Wildcard},
		},
	}
	
	cards = append(cards, specialCards...)
	
	return cards
}

// GetCardsByLevel 根据等级获取发展卡
func GetCardsByLevel(level models.CardLevel) []DevelopmentCardData {
	allCards := GetAllDevelopmentCards()
	var levelCards []DevelopmentCardData
	
	for _, card := range allCards {
		if card.Level == level {
			levelCards = append(levelCards, card)
		}
	}
	
	return levelCards
}

// GetCardByID 根据ID获取发展卡
func GetCardByID(id string) *DevelopmentCardData {
	allCards := GetAllDevelopmentCards()
	
	for _, card := range allCards {
		if card.ID == id {
			return &card
		}
	}
	
	return nil
}

// GetRandomCards 随机获取指定数量的发展卡
func GetRandomCards(level models.CardLevel, count int) []DevelopmentCardData {
	levelCards := GetCardsByLevel(level)
	if len(levelCards) <= count {
		return levelCards
	}
	
	// 随机选择指定数量的卡牌
	// 这里简化实现，实际应该使用随机算法
	selectedCards := make([]DevelopmentCardData, count)
	for i := 0; i < count; i++ {
		selectedCards[i] = levelCards[i]
	}
	
	return selectedCards
}

