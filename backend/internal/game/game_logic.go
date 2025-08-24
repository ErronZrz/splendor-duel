package game

import (
	"errors"
	"fmt"
	"splendor-duel-backend/internal/models"
	"strconv"
	"strings"
	"time"
)

// GameActionType 游戏行动类型
type GameActionType string

const (
	ActionSpendPrivilege    GameActionType = "spend_privilege"    // 花费特权指示物
	ActionRefillBoard       GameActionType = "refill_board"       // 补充版图
	ActionTakeGems          GameActionType = "take_gems"          // 拿取宝石
	ActionBuyCard           GameActionType = "buy_card"           // 购买发展卡
	ActionReserveCard       GameActionType = "reserve_card"       // 保留发展卡
)

// GameAction 游戏行动
type GameAction struct {
	Type      GameActionType              `json:"type"`
	PlayerID  string                      `json:"playerId"`
	Data      map[string]any      `json:"data"`
}

// GameLogic 游戏逻辑管理器
type GameLogic struct {
	gameState *models.GameState
	manager   *Manager
}

// NewGameLogic 创建新的游戏逻辑管理器
func NewGameLogic(gameState *models.GameState, manager *Manager) *GameLogic {
	return &GameLogic{
		gameState: gameState,
		manager:   manager,
	}
}

// StartGame 开始游戏
func (gl *GameLogic) StartGame() error {
	if gl.gameState.Status != models.GameStatusWaiting {
		return errors.New("游戏状态不正确，无法开始")
	}
	
	// 随机决定起始玩家
	gl.gameState.CurrentPlayerIndex = 0 // 简化处理，总是从第一个玩家开始
	
	// 后手玩家获得一个特权指示物
	if len(gl.gameState.Players) > 1 {
		gl.gameState.Players[1].PrivilegeTokens++
		gl.gameState.AvailablePrivilegeTokens--
	}
	
	// 初始化宝石版图
	gl.initializeGemBoard()
	
	// 初始化发展卡
	gl.initializeDevelopmentCards()
	
	// 初始化贵族卡
	gl.initializeNobleCards()
	
	// 设置游戏状态
	gl.gameState.Status = models.GameStatusPlaying
	gl.gameState.TurnNumber = 1
	
	return nil
}

// 初始化宝石版图
func (gl *GameLogic) initializeGemBoard() {
	// 宝石版图坐标系统：5x5网格，从(0,0)到(4,4)
	gl.gameState.GemBoard = make([][]models.GemType, 5)
	for i := range gl.gameState.GemBoard {
		gl.gameState.GemBoard[i] = make([]models.GemType, 5)
	}
	
	// 创建宝石数组（正确数量：白蓝绿红黑各4个，珍珠2个，黄金3个，共25个）
	gemTypes := []models.GemType{
		models.GemWhite, models.GemWhite, models.GemWhite, models.GemWhite, // 4个白色
		models.GemBlue, models.GemBlue, models.GemBlue, models.GemBlue,     // 4个蓝色
		models.GemGreen, models.GemGreen, models.GemGreen, models.GemGreen, // 4个绿色
		models.GemRed, models.GemRed, models.GemRed, models.GemRed,         // 4个红色
		models.GemBlack, models.GemBlack, models.GemBlack, models.GemBlack, // 4个黑色
		models.GemPearl, models.GemPearl,                                  // 2个珍珠
		models.GemGold, models.GemGold, models.GemGold,                    // 3个黄金
	}
	
	// 随机打乱宝石顺序
	for i := len(gemTypes) - 1; i > 0; i-- {
		j := gl.getRandomInt(0, i)
		gemTypes[i], gemTypes[j] = gemTypes[j], gemTypes[i]
	}
	
	// 按指定顺序填充宝石版图（完整的25个位置）
	positions := []struct{ x, y int }{
		{2, 2}, {2, 3}, // 从中心开始
		{1, 3}, {1, 2}, {1, 1}, // 向上
		{2, 1}, {3, 1}, // 向右
		{3, 2}, {3, 3}, {3, 4}, // 向下
		{2, 4}, {1, 4}, {0, 4}, // 向左
		{0, 3}, {0, 2}, {0, 1}, {0, 0}, // 向上
		{1, 0}, {2, 0}, {3, 0}, {4, 0}, // 向右
		{4, 1}, {4, 2}, {4, 3}, {4, 4}, // 向下
	}
	
	// 填充宝石
	for i, pos := range positions {
		if i < len(gemTypes) {
			gl.gameState.GemBoard[pos.x][pos.y] = gemTypes[i]
		}
	}

	// 初始化宝石袋子为空
	gl.gameState.GemBag = make([]models.GemType, 0)
}

// 初始化发展卡
func (gl *GameLogic) initializeDevelopmentCards() {
	// 获取所有发展卡
	allCards := GetAllDevelopmentCards()
	
	// 初始化卡牌详细信息映射和快速查找映射
	gl.gameState.CardDetails = make(map[string]models.DevelopmentCard)
	gl.gameState.CardMap = make(map[string]models.DevelopmentCard)
	
	// 按等级分组并洗乱
	var level1Cards, level2Cards, level3Cards []DevelopmentCardData
	for _, card := range allCards {
		// 将DevelopmentCardData转换为models.DevelopmentCard并存储
		devCard := models.DevelopmentCard{
			ID:        card.ID,
			Level:     card.Level,
			Code:      card.Code,
			Color:     card.Color,
			Points:    card.Points,
			Crowns:    card.Crowns,
			Bonus:     card.Bonus,
			Cost:      card.Cost,
			Effects:   card.Effects,
			IsSpecial: card.IsSpecial,
		}
		gl.gameState.CardDetails[card.ID] = devCard
		gl.gameState.CardMap[card.ID] = devCard
		
		switch card.Level {
		case models.Level1:
			level1Cards = append(level1Cards, card)
		case models.Level2:
			level2Cards = append(level2Cards, card)
		case models.Level3:
			level3Cards = append(level3Cards, card)
		}
	}
	
	// 洗乱每个等级的牌堆
	gl.shuffleDeck(&level1Cards)
	gl.shuffleDeck(&level2Cards)
	gl.shuffleDeck(&level3Cards)
	
	// 初始化三个等级的牌堆
	gl.gameState.Level1Deck = make([]string, len(level1Cards))
	gl.gameState.Level2Deck = make([]string, len(level2Cards))
	gl.gameState.Level3Deck = make([]string, len(level3Cards))
	
	// 将洗乱后的卡牌ID放入牌堆
	for i, card := range level1Cards {
		gl.gameState.Level1Deck[i] = card.ID
	}
	for i, card := range level2Cards {
		gl.gameState.Level2Deck[i] = card.ID
	}
	for i, card := range level3Cards {
		gl.gameState.Level3Deck[i] = card.ID
	}
	
	// 设置未翻开的卡牌数量
	gl.gameState.UnflippedCards = map[models.CardLevel]int{
		models.Level1: len(level1Cards),
		models.Level2: len(level2Cards),
		models.Level3: len(level3Cards),
	}
	
	// 从牌堆顶翻开初始卡牌
	gl.gameState.FlippedCards = map[models.CardLevel][]string{
		models.Level1: gl.drawCardsFromDeck(models.Level1, 5),
		models.Level2: gl.drawCardsFromDeck(models.Level2, 4),
		models.Level3: gl.drawCardsFromDeck(models.Level3, 3),
	}
}

// 初始化贵族卡
func (gl *GameLogic) initializeNobleCards() {
	// 设置可用的贵族卡（4张固定贵族）
	gl.gameState.AvailableNobles = []string{
		"noble1", // 2分&窃取
		"noble2", // 2分&新的回合
		"noble3", // 2分&获取特权
		"noble4", // 3分
	}
}

// 获取随机整数
func (gl *GameLogic) getRandomInt(min, max int) int {
	return min + int(time.Now().UnixNano())%(max-min+1)
}

// 洗乱牌堆
func (gl *GameLogic) shuffleDeck(cards *[]DevelopmentCardData) {
	// Fisher-Yates 洗牌算法
	for i := len(*cards) - 1; i > 0; i-- {
		j := gl.getRandomInt(0, i)
		(*cards)[i], (*cards)[j] = (*cards)[j], (*cards)[i]
	}
}

// 从指定等级的牌堆顶抽取指定数量的卡牌
func (gl *GameLogic) drawCardsFromDeck(level models.CardLevel, count int) []string {
	var deck *[]string
	switch level {
	case models.Level1:
		deck = &gl.gameState.Level1Deck
	case models.Level2:
		deck = &gl.gameState.Level2Deck
	case models.Level3:
		deck = &gl.gameState.Level3Deck
	default:
		return []string{}
	}
	
	if len(*deck) < count {
		count = len(*deck)
	}
	
	// 从牌堆顶抽取卡牌
	drawnCards := (*deck)[:count]
	*deck = (*deck)[count:]
	
	// 更新未翻开卡牌数量
	gl.gameState.UnflippedCards[level] = len(*deck)
	
	return drawnCards
}









// 验证宝石是否在一条直线上且连续
func (gl *GameLogic) validateGemLine(positions []any) bool {
	if len(positions) < 2 {
		return true
	}
	
	// 获取第一个位置
	firstPos, ok := positions[0].(map[string]any)
	if !ok {
		return false
	}
	
	x1, ok := firstPos["x"].(float64)
	if !ok {
		return false
	}
	
	y1, ok := firstPos["y"].(float64)
	if !ok {
		return false
	}
	
	// 检查是否在一条直线上
	isHorizontal := true
	isVertical := true
	isDiagonal := true
	
	for i := 1; i < len(positions); i++ {
		pos, ok := positions[i].(map[string]any)
		if !ok {
			return false
		}
		
		x2, ok := pos["x"].(float64)
		if !ok {
			return false
		}
		
		y2, ok := pos["y"].(float64)
		if !ok {
			return false
		}
		
		// 检查水平线
		if y1 != y2 {
			isHorizontal = false
		}
		
		// 检查垂直线
		if x1 != x2 {
			isVertical = false
		}
		
		// 检查对角线
		if x1-x2 != y1-y2 && x1-x2 != -(y1-y2) {
			isDiagonal = false
		}
		
		// 检查连续性（简化处理）
		if !gl.arePositionsAdjacent(int(x1), int(y1), int(x2), int(y2)) {
			return false
		}
		
		x1, y1 = x2, y2
	}
	
	return isHorizontal || isVertical || isDiagonal
}

// 检查两个位置是否相邻
func (gl *GameLogic) arePositionsAdjacent(x1, y1, x2, y2 int) bool {
	dx := abs(x1 - x2)
	dy := abs(y1 - y2)
	return (dx == 1 && dy == 0) || (dx == 0 && dy == 1) || (dx == 1 && dy == 1)
}

// 绝对值函数
func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// 计算应支付费用
func (gl *GameLogic) calculateRequiredGems(card *DevelopmentCardData, player *models.Player) map[models.GemType]int {
	required := make(map[models.GemType]int)
	
	for gemType, cost := range card.Cost {
		bonus := player.Bonus[gemType]
		if cost > bonus {
			required[gemType] = cost - bonus
		}
	}
	
	return required
}



// 从场上移除卡牌
func (gl *GameLogic) removeCardFromBoard(cardID string) {
	// 从翻开的卡牌中移除
	for level, cards := range gl.gameState.FlippedCards {
		for i, id := range cards {
			if id == cardID {
				gl.gameState.FlippedCards[level] = append(cards[:i], cards[i+1:]...)
				return
			}
		}
	}
}

// 结算卡牌效果
func (gl *GameLogic) resolveCardEffects(card *DevelopmentCardData, playerID string) {
	player := gl.getPlayer(playerID)
	if player == nil {
		return
	}
	
	for _, effect := range card.Effects {
		switch effect {
		case models.ExtraToken:
			// 额外token效果
			player.Gems[card.Bonus]++
		case models.NewTurn:
			// 新回合效果
			gl.gameState.ExtraTurns[playerID]++
		case models.Wildcard:
			// 百搭效果
			// 这里需要玩家选择颜色，暂时跳过
		case models.GetPrivilege:
			// 获取特权效果
			if player.PrivilegeTokens < 3 {
				player.PrivilegeTokens++
				gl.gameState.AvailablePrivilegeTokens--
			}
		case models.Steal:
			// 窃取效果
			// 这里需要玩家选择要窃取的宝石，暂时跳过
		}
	}
}

// 补充翻开的卡牌
func (gl *GameLogic) refillFlippedCards(level models.CardLevel) {
	var targetCount int
	switch level {
	case models.Level2:
		targetCount = 4
	case models.Level3:
		targetCount = 3
	default:
		targetCount = 5
	}
	
	currentCount := len(gl.gameState.FlippedCards[level])
	if currentCount < targetCount && gl.gameState.UnflippedCards[level] > 0 {
		// 从牌堆中抽取卡牌
		card := gl.drawCardFromDeck(level)
		if card != nil {
			gl.gameState.FlippedCards[level] = append(gl.gameState.FlippedCards[level], card.ID)
		}
	}
}

// 从牌堆抽取一张卡牌
func (gl *GameLogic) drawCardFromDeck(level models.CardLevel) *DevelopmentCardData {
	if gl.gameState.UnflippedCards[level] <= 0 {
		return nil
	}
	
	// 从对应等级的牌堆顶抽取一张卡牌
	drawnCards := gl.drawCardsFromDeck(level, 1)
	if len(drawnCards) > 0 {
		cardID := drawnCards[0]
		// 使用快速查找映射，O(1) 时间复杂度
		if card, exists := gl.gameState.CardMap[cardID]; exists {
			// 将 models.DevelopmentCard 转换为 DevelopmentCardData
			return &DevelopmentCardData{
				ID:        card.ID,
				Level:     card.Level,
				Code:      card.Code,
				Color:     card.Color,
				Points:    card.Points,
				Crowns:    card.Crowns,
				Bonus:     card.Bonus,
				Cost:      card.Cost,
				Effects:   card.Effects,
				IsSpecial: card.IsSpecial,
			}
		}
	}
	
	return nil
}









// 切换到下一个玩家
func (gl *GameLogic) nextTurn() {
	// 检查是否有额外回合
	currentPlayer := gl.gameState.Players[gl.gameState.CurrentPlayerIndex]
	if gl.gameState.ExtraTurns[currentPlayer.ID] > 0 {
		gl.gameState.ExtraTurns[currentPlayer.ID]--
		// 继续当前玩家的回合
		return
	}
	
	// 切换到下一个玩家
	gl.gameState.CurrentPlayerIndex = (gl.gameState.CurrentPlayerIndex + 1) % len(gl.gameState.Players)
	gl.gameState.TurnNumber++
}



// 获取玩家索引
func (gl *GameLogic) getPlayerIndex(playerID string) int {
	for i, player := range gl.gameState.Players {
		if player.ID == playerID {
			return i
		}
	}
	return -1
}

// 获取玩家
func (gl *GameLogic) getPlayer(playerID string) *models.Player {
	for i, player := range gl.gameState.Players {
		if player.ID == playerID {
			return &gl.gameState.Players[i]
		}
	}
	return nil
}





// 执行强制行动（暂时注释掉，避免类型不匹配问题）
/*
func (gl *GameLogic) executeMandatoryAction(playerID string, action *models.GameAction) error {
	switch action.Type {
	case ActionTakeGems:
		return gl.executeTakeGems(playerID, action)
	case ActionBuyCard:
		return gl.executeBuyCard(playerID, action)
	case ActionReserveCard:
		return gl.executeReserveCard(playerID, action)
	default:
		return errors.New("无效的强制行动类型")
	}
}
*/



// TakeGems 拿取宝石
func (gl *GameLogic) TakeGems(playerID string, gemPositions []map[string]any) error {
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	if len(gemPositions) < 1 || len(gemPositions) > 3 {
		return errors.New("只能拿取1-3个宝石")
	}
	
	// 验证宝石位置和连续性
	// 转换类型以匹配validateGemLine函数的参数
	var positions []any
	for _, pos := range gemPositions {
		positions = append(positions, pos)
	}
	
	if !gl.validateGemLine(positions) {
		return errors.New("宝石不在同一直线上或不相邻")
	}
	
	// 从版图上移除宝石并添加到玩家手中
	for _, pos := range gemPositions {
		x, xOk := pos["x"].(float64)
		y, yOk := pos["y"].(float64)
		if !xOk || !yOk {
			return errors.New("无效的宝石位置")
		}
		
		rowIndex, colIndex := int(x), int(y)
		if rowIndex < 0 || rowIndex >= 5 || colIndex < 0 || colIndex >= 5 {
			return errors.New("宝石位置超出范围")
		}
		
		gemType := gl.gameState.GemBoard[rowIndex][colIndex]
		if gemType == "" {
			return errors.New("该位置没有宝石")
		}
		
		// 将宝石添加到玩家手中
		gl.gameState.Players[playerIndex].Gems[gemType]++
		
		// 从版图上移除宝石
		gl.gameState.GemBoard[rowIndex][colIndex] = ""
	}
	
	// 切换到下一个玩家
	gl.nextTurn()
	
	return nil
}

// ReserveCard 保留发展卡
func (gl *GameLogic) ReserveCard(playerID string, cardID string, goldX, goldY int) error {
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 验证黄金位置
	if goldX < 0 || goldX >= 5 || goldY < 0 || goldY >= 5 {
		return errors.New("黄金位置超出范围")
	}
	
	if gl.gameState.GemBoard[goldX][goldY] != "gold" {
		return errors.New("该位置没有黄金")
	}
	
	// 检查玩家保留区是否已满
	if len(gl.gameState.Players[playerIndex].ReservedCards) >= 3 {
		return errors.New("保留区已满，无法保留更多卡牌")
	}
	
	// 将黄金添加到玩家手中
	gl.gameState.Players[playerIndex].Gems["gold"]++
	
	// 从版图上移除黄金
	gl.gameState.GemBoard[goldX][goldY] = ""
	
	var reservedCardID string
	
	if strings.HasPrefix(cardID, "deck_level_") {
		// 从牌堆盲抽卡牌
		// 解析等级信息
		levelStr := strings.TrimPrefix(cardID, "deck_level_")
		levelInt, err := strconv.Atoi(levelStr)
		if err != nil {
			return errors.New("无效的牌堆等级信息")
		}
		
		selectedLevel := models.CardLevel(levelInt)
		if selectedLevel < 1 || selectedLevel > 3 {
			return errors.New("无效的牌堆等级")
		}
		
		// 检查该等级牌堆是否有剩余卡牌
		if gl.gameState.UnflippedCards[selectedLevel] <= 0 {
			return errors.New("该等级牌堆已空，无法盲抽卡牌")
		}
		
		// 从该等级牌堆顶抽取一张卡牌
		if gl.gameState.UnflippedCards[selectedLevel] > 0 {
			drawnCards := gl.drawCardsFromDeck(selectedLevel, 1)
			if len(drawnCards) > 0 {
				reservedCardID = drawnCards[0]
			} else {
				return errors.New("无法从牌堆获取卡牌")
			}
		} else {
			return errors.New("该等级牌堆已空，无法盲抽卡牌")
		}
	} else if cardID == "" {
		// 兼容旧版本：空字符串表示随机选择等级
		// 随机选择一个等级
		availableLevels := []models.CardLevel{}
		for level := models.CardLevel(1); level <= 3; level++ {
			if gl.gameState.UnflippedCards[level] > 0 {
				availableLevels = append(availableLevels, level)
			}
		}
		
		if len(availableLevels) == 0 {
			return errors.New("所有牌堆都已空，无法盲抽卡牌")
		}
		
		// 随机选择一个等级
		randomLevelIndex := gl.getRandomInt(0, len(availableLevels)-1)
		selectedLevel := availableLevels[randomLevelIndex]
		
		// 从该等级牌堆顶抽取一张卡牌
		if gl.gameState.UnflippedCards[selectedLevel] > 0 {
			drawnCards := gl.drawCardsFromDeck(selectedLevel, 1)
			if len(drawnCards) > 0 {
				reservedCardID = drawnCards[0]
			} else {
				return errors.New("无法从牌堆获取卡牌")
			}
		} else {
			return errors.New("该等级牌堆已空，无法盲抽卡牌")
		}
	} else {
		// 保留场上已翻开的卡牌
		// 验证卡牌是否存在且可以被保留
		var cardLevel models.CardLevel
		var cardFound bool
		var cardIndex int
		
		// 检查已翻开的卡牌
		for level := 1; level <= 3; level++ {
			levelCards := gl.gameState.FlippedCards[models.CardLevel(level)]
			for i, cardIDInLevel := range levelCards {
				if cardIDInLevel == cardID {
					cardLevel = models.CardLevel(level)
					cardFound = true
					cardIndex = i
					break
				}
			}
			if cardFound {
				break
			}
		}
		
		if !cardFound {
			return errors.New("卡牌不存在或无法保留")
		}
		
		reservedCardID = cardID
		
		// 从场上移除该卡牌
		levelCards := gl.gameState.FlippedCards[cardLevel]
		gl.gameState.FlippedCards[cardLevel] = append(levelCards[:cardIndex], levelCards[cardIndex+1:]...)
		
		// 从对应等级的未翻开牌堆中补充一张卡牌
		if gl.gameState.UnflippedCards[cardLevel] > 0 {
			card := gl.drawCardFromDeck(cardLevel)
			gl.gameState.FlippedCards[cardLevel] = append(gl.gameState.FlippedCards[cardLevel], card.ID)
		}
	}
	
	// 将卡牌添加到玩家保留区
	gl.gameState.Players[playerIndex].ReservedCards = append(gl.gameState.Players[playerIndex].ReservedCards, reservedCardID)
	
	// 切换到下一个玩家
	gl.nextTurn()
	
	return nil
}

// SpendPrivilege 花费特权指示物
func (gl *GameLogic) SpendPrivilege(playerID string, privilegeCount int, gemPositions []map[string]any) error {
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	player := &gl.gameState.Players[playerIndex]
	if player.PrivilegeTokens < privilegeCount {
		return errors.New("特权指示物不足")
	}
	
	if len(gemPositions) != privilegeCount {
		return errors.New("选择的宝石数量与特权数量不匹配")
	}
	
	// 扣除特权指示物
	player.PrivilegeTokens -= privilegeCount
	gl.gameState.AvailablePrivilegeTokens += privilegeCount
	
	// 将宝石添加到玩家手中
	for _, pos := range gemPositions {
		x, xOk := pos["x"].(float64)
		y, yOk := pos["y"].(float64)
		if !xOk || !yOk {
			return errors.New("无效的宝石位置")
		}
		
		rowIndex, colIndex := int(x), int(y)
		if rowIndex < 0 || rowIndex >= 5 || colIndex < 0 || colIndex >= 5 {
			return errors.New("宝石位置超出范围")
		}
		
		gemType := gl.gameState.GemBoard[rowIndex][colIndex]
		if gemType == "" {
			return errors.New("该位置没有宝石")
		}
		
		// 将宝石添加到玩家手中
		player.Gems[gemType]++
		
		// 从版图上移除宝石
		gl.gameState.GemBoard[rowIndex][colIndex] = ""
	}
	
	return nil
}

// RefillBoard 补充版图
func (gl *GameLogic) RefillBoard(playerID string) error {
	if len(gl.gameState.GemBag) == 0 {
		return errors.New("宝石袋子为空，无法补充版图")
	}
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 按照指定顺序补充宝石版图
	refillOrder := [][]int{
		{2, 2}, {3, 2}, // 2,2 至 3,2（往下）
		{3, 1}, {2, 1}, {1, 1}, // 3,1 至 1,1（往上）
		{1, 2}, {1, 3}, // 1,2 至 1,3（往右）
		{2, 3}, {3, 3}, {4, 3}, // 2,3 至 4,3（往下）
		{4, 2}, {4, 1}, {4, 0}, // 4,2 至 4,0（往左）
		{3, 0}, {2, 0}, {1, 0}, {0, 0}, // 3,0 至 0,0（往上）
		{0, 1}, {0, 2}, {0, 3}, {0, 4}, // 0,1 至 0,4（往右）
		{1, 4}, {2, 4}, {3, 4}, {4, 4}, // 1,4 至 4,4（往下）
	}

	// 洗乱袋子里的宝石
	for i := len(gl.gameState.GemBag) - 1; i > 0; i-- {
		j := gl.getRandomInt(0, i)
		gl.gameState.GemBag[i], gl.gameState.GemBag[j] = gl.gameState.GemBag[j], gl.gameState.GemBag[i]
	}
	
	// 从宝石袋子中按顺序补充宝石
	for _, pos := range refillOrder {
		x, y := pos[0], pos[1]
		if gl.gameState.GemBoard[x][y] == models.GemType("") {
			// 从袋子中取出第一个宝石
			gemType := gl.gameState.GemBag[0]
			gl.gameState.GemBag = gl.gameState.GemBag[1:] // 移除已取出的宝石
			gl.gameState.GemBoard[x][y] = gemType
			if len(gl.gameState.GemBag) == 0 {
				break
			}
		}
	}
	
	// 对手获得特权指示物
	opponentIndex := (playerIndex + 1) % len(gl.gameState.Players)
	if gl.gameState.AvailablePrivilegeTokens > 0 {
		gl.gameState.Players[opponentIndex].PrivilegeTokens++
		gl.gameState.AvailablePrivilegeTokens--
	}
	
	return nil
}

// 检查玩家是否可以购买卡牌
func (gl *GameLogic) CanPlayerBuyCard(playerID string, cardID string) (bool, string, error) {
	player := gl.getPlayer(playerID)
	if player == nil {
		return false, "", errors.New("玩家不存在")
	}
	
	// 获取卡牌信息
	card, exists := gl.gameState.CardDetails[cardID]
	if !exists {
		return false, "", errors.New("卡牌不存在")
	}
	
	// 计算总费用（考虑奖励优惠）
	totalRequired := 0
	missingGems := make(map[models.GemType]int)
	
	for gemType, required := range card.Cost {
		bonus := player.Bonus[gemType]
		available := player.Gems[gemType]
		actualRequired := required - bonus
		if actualRequired > 0 {
			totalRequired += actualRequired
			if actualRequired > available {
				missingGems[gemType] = actualRequired - available
			}
		}
	}
	
	// 检查是否有足够的黄金来补足短缺
	availableGold := player.Gems[models.GemGold]
	totalMissing := 0
	for _, missing := range missingGems {
		totalMissing += missing
	}
	
	if totalMissing <= availableGold {
		return true, "", nil
	}
	
	// 构建缺失宝石的详细信息
	var missingDetails []string
	for gemType, count := range missingGems {
		gemName := getGemDisplayName(gemType)
		missingDetails = append(missingDetails, fmt.Sprintf("%s×%d", gemName, count))
	}
	
	message := fmt.Sprintf("宝石不足，缺少: %s", strings.Join(missingDetails, ", "))
	return false, message, nil
}

// 获取宝石显示名称
func getGemDisplayName(gemType models.GemType) string {
	switch gemType {
	case models.GemWhite:
		return "白宝石"
	case models.GemBlue:
		return "蓝宝石"
	case models.GemGreen:
		return "绿宝石"
	case models.GemRed:
		return "红宝石"
	case models.GemBlack:
		return "黑宝石"
	case models.GemPearl:
		return "珍珠"
	case models.GemGold:
		return "黄金"
	default:
		return string(gemType)
	}
}

// 验证支付计划是否有效
func (gl *GameLogic) validatePaymentPlan(player *models.Player, paymentPlan map[string]any, requiredGems map[models.GemType]int) bool {
	// 计算支付计划中的总支付金额
	var totalPaid, goldRequired, goldPaid int
	for gemType, count := range paymentPlan {
		var countInt int
		if countFloat, ok := count.(float64); ok {
			countInt = int(countFloat)
			totalPaid += countInt
		}
		// 检查玩家是否有足够的宝石
		if player.Gems[models.GemType(gemType)] < countInt {
			return false
		}
		if gemType == "gold" {
			goldPaid = countInt
			continue
		}
		// 检查是否需要用黄金补足
		required := requiredGems[models.GemType(gemType)]
		if required > countInt {
			goldRequired += required - countInt
		}
	}

	// 检查支付的黄金是否足够
	if goldPaid < goldRequired {
		return false
	}
	
	// 计算需要的总金额
	var totalRequired int
	for _, count := range requiredGems {
		totalRequired += count
	}
	
	return totalPaid == totalRequired
}

// 从玩家扣除支付计划中的宝石和黄金
func (gl *GameLogic) deductPaymentFromPlayer(player *models.Player, paymentPlan map[string]any) {
	for gemType, count := range paymentPlan {
		if countFloat, ok := count.(float64); ok {
			countInt := int(countFloat)
			if gemType == "gold" {
				player.Gems[models.GemGold] -= countInt
			} else {
				player.Gems[models.GemType(gemType)] -= countInt
			}
		}
	}
}

// BuyCardWithPaymentPlan 购买发展卡（带支付计划）
func (gl *GameLogic) BuyCardWithPaymentPlan(playerID string, data map[string]any) error {
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 获取卡牌ID
	cardID, ok := data["cardId"].(string)
	if !ok {
		return errors.New("缺少卡牌ID")
	}
	
	// 获取卡牌信息
	card, exists := gl.gameState.CardMap[cardID]
	if !exists {
		return errors.New("卡牌不存在")
	}
	
	// 获取玩家
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	// 获取支付计划
	paymentPlan, ok := data["paymentPlan"].(map[string]any)
	if !ok {
		return errors.New("缺少支付计划")
	}
	
	// 计算应支付费用
	requiredGems := gl.calculateRequiredGems(&DevelopmentCardData{
		ID:        card.ID,
		Level:     card.Level,
		Code:      card.Code,
		Color:     card.Color,
		Points:    card.Points,
		Crowns:    card.Crowns,
		Bonus:     card.Bonus,
		Cost:      card.Cost,
		Effects:   card.Effects,
		IsSpecial: card.IsSpecial,
	}, player)
	
	// 验证支付计划是否完整
	if !gl.validatePaymentPlan(player, paymentPlan, requiredGems) {
		return errors.New("支付计划无效或宝石不足")
	}
	
	// 扣除宝石和黄金
	gl.deductPaymentFromPlayer(player, paymentPlan)
	
	// 将宝石放回袋子
	for gemType, count := range paymentPlan {
		if countFloat, ok := count.(float64); ok {
			countInt := int(countFloat)
			// 将宝石添加到宝石袋子中
			for i := 0; i < countInt; i++ {
				gl.gameState.GemBag = append(gl.gameState.GemBag, models.GemType(gemType))
			}
		}
	}
	
	// 将卡牌添加到玩家手中
	player.DevelopmentCards = append(player.DevelopmentCards, cardID)
	player.Bonus[card.Bonus]++
	player.Points += card.Points
	player.Crowns += card.Crowns
	
	// 检查卡牌是否在保留区域，如果是则从保留区域移除
	if gl.removeCardFromReserved(playerID, cardID) {
		// 卡牌在保留区域，不需要补充翻开的卡牌
	} else {
		// 卡牌在场上，从场上移除并补充
		gl.removeCardFromBoard(cardID)
		gl.refillFlippedCards(card.Level)
	}
	
	// 结算一次性效果
	gl.resolveCardEffects(&DevelopmentCardData{
		ID:        card.ID,
		Level:     card.Level,
		Code:      card.Code,
		Color:     card.Color,
		Points:    card.Points,
		Crowns:    card.Crowns,
		Bonus:     card.Bonus,
		Cost:      card.Cost,
		Effects:   card.Effects,
		IsSpecial: card.IsSpecial,
	}, playerID)
	
	// 切换到下一个玩家
	gl.nextTurn()
	
	return nil
}

// 从玩家的保留区域移除卡牌
func (gl *GameLogic) removeCardFromReserved(playerID string, cardID string) bool {
	player := gl.getPlayer(playerID)
	if player == nil {
		return false
	}
	
	// 查找卡牌在保留区域中的位置
	for i, reservedCardID := range player.ReservedCards {
		if reservedCardID == cardID {
			// 从保留区域移除卡牌
			player.ReservedCards = append(player.ReservedCards[:i], player.ReservedCards[i+1:]...)
			return true
		}
	}
	
	// 卡牌不在保留区域
	return false
}
