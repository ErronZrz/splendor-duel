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
	if len(gl.gameState.Players) == 0 {
		return errors.New("没有玩家，无法开始游戏")
	}
	gl.gameState.CurrentPlayerIndex = gl.getRandomInt(0, len(gl.gameState.Players)-1)
	
	// 后手玩家获得一个特权指示物（统一使用拿取P函数）
	if len(gl.gameState.Players) > 1 {
		opponentIndex := (gl.gameState.CurrentPlayerIndex + 1) % len(gl.gameState.Players)
		_ = gl.TakePrivilegeToken(gl.gameState.Players[opponentIndex].ID)
	}
	
	// 初始化宝石版图
	gl.initializeGemBoard()
	
	// 初始化发展卡
	gl.initializeDevelopmentCards()
	
	// 初始化贵族卡
	gl.initializeNobleCards()
	
	// 初始化待补充列表
	gl.gameState.CardToRefill = models.PendingRefill{}
	// 初始化可选动作限制
	gl.gameState.RefilledThisTurn = false
	
	// 初始化宝石丢弃相关字段
	gl.gameState.NeedsGemDiscard = false
	gl.gameState.GemDiscardTarget = 10
	gl.gameState.GemDiscardPlayerID = ""
	
	// 设置游戏状态
	gl.gameState.Status = models.GameStatusPlaying
	gl.gameState.TurnNumber = 1
	
	return nil
}

// TakePrivilegeToken 统一的「拿取特权指示物（P）」函数
// 规则：
// 1) 若玩家已拥有3个P，则不变更，直接返回
// 2) 若公共区有剩余P，则从公共区减1，玩家加1
// 3) 否则，从对手处转移1个P到该玩家（若对手有的话）
func (gl *GameLogic) TakePrivilegeToken(playerID string) error {
    playerIndex := gl.getPlayerIndex(playerID)
    if playerIndex == -1 {
        return errors.New("玩家不存在")
    }

    // 最多3个
    if gl.gameState.Players[playerIndex].PrivilegeTokens >= 3 {
        return nil
    }

    // 先从公共区拿
    if gl.gameState.AvailablePrivilegeTokens > 0 {
        gl.gameState.Players[playerIndex].PrivilegeTokens++
        gl.gameState.AvailablePrivilegeTokens--
        return nil
    }

    // 否则从对手处获得
    if len(gl.gameState.Players) > 1 {
        opponentIndex := (playerIndex + 1) % len(gl.gameState.Players)
        if gl.gameState.Players[opponentIndex].PrivilegeTokens > 0 {
            gl.gameState.Players[opponentIndex].PrivilegeTokens--
            gl.gameState.Players[playerIndex].PrivilegeTokens++
        }
    }

    return nil
}

// GrantOpponentPrivilege 让对手获得一个特权指示物（根据当前玩家计算对手）
func (gl *GameLogic) GrantOpponentPrivilege(playerID string) error {
    playerIndex := gl.getPlayerIndex(playerID)
    if playerIndex == -1 {
        return errors.New("玩家不存在")
    }
    if len(gl.gameState.Players) < 2 {
        return nil
    }
    opponentIndex := (playerIndex + 1) % len(gl.gameState.Players)
    return gl.TakePrivilegeToken(gl.gameState.Players[opponentIndex].ID)
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



// 从场上移除卡牌，返回被移除卡牌的等级和位置
func (gl *GameLogic) removeCardFromBoard(cardID string) (models.CardLevel, int) {
	// 从翻开的卡牌中移除
	for level, cards := range gl.gameState.FlippedCards {
		for i, id := range cards {
			if id == cardID {
				gl.gameState.FlippedCards[level] = append(cards[:i], cards[i+1:]...)
				return level, i
			}
		}
	}
	return 0, -1
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
			// 额外token效果，待实现
		case models.NewTurn:
			// 新回合效果
			gl.gameState.ExtraTurns[playerID]++
		case models.Wildcard:
			// 百搭颜色效果，待实现
		case models.GetPrivilege:
			// 获取特权效果（统一使用拿取P函数）
			_ = gl.TakePrivilegeToken(playerID)
		case models.Steal:
			// 窃取效果，待实现
		}
	}
}

// 统一的补充发展卡函数
func (gl *GameLogic) refillDevelopmentCards(level models.CardLevel, removedCardIndex int) {
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
	
	// 只有当牌堆有剩余卡牌且场上卡牌数量少于目标数量时才补充
	if currentCount < targetCount && gl.gameState.UnflippedCards[level] > 0 {
		// 从牌堆中抽取一张卡牌
		card := gl.drawCardFromDeck(level)
		if card != nil {
			// 将新卡牌插入到被移除卡牌的位置，保持顺序
			if removedCardIndex >= 0 && removedCardIndex < len(gl.gameState.FlippedCards[level]) {
				// 在指定位置插入新卡牌
				gl.gameState.FlippedCards[level] = append(gl.gameState.FlippedCards[level][:removedCardIndex], 
					append([]string{card.ID}, gl.gameState.FlippedCards[level][removedCardIndex:]...)...)
			} else {
				// 如果位置无效，追加到末尾
				gl.gameState.FlippedCards[level] = append(gl.gameState.FlippedCards[level], card.ID)
			}
		}
	}
}

// 回合结束处理函数
func (gl *GameLogic) HandleTurnEnd() error {
	// 检查并获取贵族，待实现

	// 处理待补充的发展卡
	if gl.gameState.CardToRefill.Level != 0 {
		gl.refillDevelopmentCards(gl.gameState.CardToRefill.Level, gl.gameState.CardToRefill.Index)
		// 清空待补充列表
		gl.gameState.CardToRefill = models.PendingRefill{
			Level: 0,
			Index: 0,
		}
	}
	
	// 检查当前玩家宝石数量是否超过限制
	currentPlayer := &gl.gameState.Players[gl.gameState.CurrentPlayerIndex]
	totalGems := gl.calculateTotalGems(currentPlayer)
	
	// 添加调试日志
	fmt.Printf("回合结束检查 - 玩家ID: %s, 宝石总数: %d, 需要丢弃: %v\n", 
		currentPlayer.ID, totalGems, totalGems > 10)
	
	if totalGems > 10 {
		// 设置需要丢弃宝石的状态，并记录需要丢弃的玩家ID
		gl.gameState.NeedsGemDiscard = true
		gl.gameState.GemDiscardTarget = 10
		gl.gameState.GemDiscardPlayerID = currentPlayer.ID
		fmt.Printf("设置宝石丢弃状态 - 玩家ID: %s, NeedsGemDiscard: %v, Target: %d\n", 
			currentPlayer.ID, gl.gameState.NeedsGemDiscard, gl.gameState.GemDiscardTarget)
		return nil // 不切换回合，等待玩家丢弃宝石
	}
	
	// 检查胜利条件，待实现
	
	// 切换到下一个玩家前，重置本回合限制状态
	gl.gameState.RefilledThisTurn = false
	// 切换到下一个玩家
	gl.nextTurn()
	
	return nil
}

// 计算玩家总宝石数量
func (gl *GameLogic) calculateTotalGems(player *models.Player) int {
	total := 0
	fmt.Printf("计算玩家 %s 的宝石总数:\n", player.ID)
	for gemType, count := range player.Gems {
		if gemType != "" { // 排除空字符串
			fmt.Printf("  %s: %d\n", gemType, count)
			total += count
		}
	}
	fmt.Printf("总宝石数: %d\n", total)
	return total
}

// 丢弃宝石
func (gl *GameLogic) DiscardGem(playerID string, gemType models.GemType) error {
	fmt.Printf("DiscardGem 被调用 - 玩家ID: %s, 宝石类型: %s\n", playerID, gemType)
	
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	// 检查是否为当前玩家
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 检查是否真的需要丢弃宝石
	if !gl.gameState.NeedsGemDiscard {
		fmt.Printf("当前不需要丢弃宝石 - NeedsGemDiscard: %v\n", gl.gameState.NeedsGemDiscard)
		return errors.New("当前不需要丢弃宝石")
	}
	
	player := &gl.gameState.Players[playerIndex]
	
	// 检查玩家是否有该类型的宝石
	if player.Gems[gemType] <= 0 {
		return errors.New("没有该类型的宝石可以丢弃")
	}
	
	// 丢弃一个宝石
	player.Gems[gemType]--
	fmt.Printf("丢弃宝石成功 - 类型: %s, 剩余: %d\n", gemType, player.Gems[gemType])
	
	// 将宝石放回袋子
	gl.gameState.GemBag = append(gl.gameState.GemBag, gemType)
	
	// 检查是否已经达到目标数量
	totalGems := gl.calculateTotalGems(player)
	fmt.Printf("丢弃后宝石总数: %d, 目标: %d\n", totalGems, gl.gameState.GemDiscardTarget)
	
	if totalGems <= gl.gameState.GemDiscardTarget {
		// 重置丢弃状态
		gl.gameState.NeedsGemDiscard = false
		gl.gameState.GemDiscardTarget = 10
		gl.gameState.GemDiscardPlayerID = ""
		fmt.Printf("达到目标数量，重置状态\n")
		
		// 不自动切换回合，等待前端确认
		// 前端确认后会调用 handleTurnEnd 来切换回合
	}
	
	return nil
}

// DiscardGemsBatch 批量丢弃宝石
func (gl *GameLogic) DiscardGemsBatch(playerID string, gemDiscards map[models.GemType]int) error {
	fmt.Printf("DiscardGemsBatch 被调用 - 玩家ID: %s, 丢弃详情: %v\n", playerID, gemDiscards)
	
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	// 检查是否为当前玩家
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 检查是否真的需要丢弃宝石
	if !gl.gameState.NeedsGemDiscard {
		fmt.Printf("当前不需要丢弃宝石 - NeedsGemDiscard: %v\n", gl.gameState.NeedsGemDiscard)
		return errors.New("当前不需要丢弃宝石")
	}
	
	player := &gl.gameState.Players[playerIndex]
	
	// 验证丢弃操作是否有效
	for gemType, count := range gemDiscards {
		if count <= 0 {
			continue
		}
		
		// 检查玩家是否有足够的该类型宝石
		if player.Gems[gemType] < count {
			return fmt.Errorf("没有足够的 %s 宝石，需要 %d，实际有 %d", gemType, count, player.Gems[gemType])
		}
	}
	
	// 执行批量丢弃
	for gemType, count := range gemDiscards {
		if count <= 0 {
			continue
		}
		
		// 丢弃宝石
		player.Gems[gemType] -= count
		
		// 将宝石放回袋子
		for i := 0; i < count; i++ {
			gl.gameState.GemBag = append(gl.gameState.GemBag, gemType)
		}
		
		fmt.Printf("批量丢弃宝石 - 类型: %s, 数量: %d, 剩余: %d\n", gemType, count, player.Gems[gemType])
	}
	
	// 检查是否已经达到目标数量
	totalGems := gl.calculateTotalGems(player)
	fmt.Printf("批量丢弃后宝石总数: %d, 目标: %d\n", totalGems, gl.gameState.GemDiscardTarget)
	
	if totalGems <= gl.gameState.GemDiscardTarget {
		// 重置丢弃状态
		gl.gameState.NeedsGemDiscard = false
		gl.gameState.GemDiscardTarget = 10
		gl.gameState.GemDiscardPlayerID = ""
		fmt.Printf("达到目标数量，重置状态\n")
		
		// 不自动切换回合，等待前端确认
		// 前端确认后会调用 handleTurnEnd 来切换回合
	}
	
	return nil
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
	fmt.Printf("nextTurn 被调用 - 当前玩家索引: %d\n", gl.gameState.CurrentPlayerIndex)
	
	// 检查是否有额外回合
	currentPlayer := gl.gameState.Players[gl.gameState.CurrentPlayerIndex]
	if gl.gameState.ExtraTurns[currentPlayer.ID] > 0 {
		gl.gameState.ExtraTurns[currentPlayer.ID]--
		fmt.Printf("玩家 %s 有额外回合，继续当前玩家回合\n", currentPlayer.ID)
		// 继续当前玩家的回合
		return
	}
	
	// 切换到下一个玩家
	oldIndex := gl.gameState.CurrentPlayerIndex
	gl.gameState.CurrentPlayerIndex = (gl.gameState.CurrentPlayerIndex + 1) % len(gl.gameState.Players)
	gl.gameState.TurnNumber++
	
	fmt.Printf("回合切换 - 从玩家 %d 切换到玩家 %d, 回合数: %d\n", 
		oldIndex, gl.gameState.CurrentPlayerIndex, gl.gameState.TurnNumber)
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
	
	// 调用回合结束处理函数，检查宝石数量
	if err := gl.HandleTurnEnd(); err != nil {
		fmt.Printf("回合结束处理失败: %v\n", err)
		return err
	}
	
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
		
		// 将位置信息存储到游戏状态中，供回合结束时使用
		gl.gameState.CardToRefill = models.PendingRefill{
			Level: cardLevel,
			Index: cardIndex,
		}
	}
	
	// 将卡牌添加到玩家保留区
	gl.gameState.Players[playerIndex].ReservedCards = append(gl.gameState.Players[playerIndex].ReservedCards, reservedCardID)
	
	// 调用回合结束处理函数
	if err := gl.HandleTurnEnd(); err != nil {
		fmt.Printf("回合结束处理失败: %v\n", err)
		return err
	}
	
	return nil
}

// SpendPrivilege 花费特权指示物
func (gl *GameLogic) SpendPrivilege(playerID string, privilegeCount int, gemPositions []map[string]any) error {
	// 可选动作顺序限制：若本回合已补充版图，则不能花费特权
	if gl.gameState.RefilledThisTurn {
		return errors.New("本回合已补充版图，不能使用特权指示物")
	}
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

	// 标记本回合已补充版图
	gl.gameState.RefilledThisTurn = true

	// 对手获得特权指示物（统一使用GrantOpponentPrivilege）
	_ = gl.GrantOpponentPrivilege(gl.gameState.Players[playerIndex].ID)
	
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
	case models.GemGray:
		return "无色"
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

// BuyCardWithPaymentPlanAndEffects 购买发展卡（带支付计划与特效一次性结算）
func (gl *GameLogic) BuyCardWithPaymentPlanAndEffects(playerID string, data map[string]any) error {
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
		// 卡牌在场上，从场上移除并记录位置信息
		cardLevel, cardIndex := gl.removeCardFromBoard(cardID)
		// 将位置信息存储到游戏状态中，供回合结束时使用
		gl.gameState.CardToRefill = models.PendingRefill{
			Level: cardLevel,
			Index: cardIndex,
		}
	}
	
	// 先结算需要玩家即时确认的一次性效果（本次仅额外token）
	gl.resolveImmediateEffects(&DevelopmentCardData{
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
	}, playerID, data)

	// 再结算无需确认的效果（新回合、获得特权等）
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
	
	// 调用回合结束处理函数
	if err := gl.HandleTurnEnd(); err != nil {
		fmt.Printf("回合结束处理失败: %v\n", err)
		return err
	}
	
	return nil
}

// 处理需要玩家二次确认的特效（额外token/窃取/百搭颜色）
// 本次仅实现额外token
func (gl *GameLogic) resolveImmediateEffects(card *DevelopmentCardData, playerID string, data map[string]any) {
    player := gl.getPlayer(playerID)
    if player == nil {
        return
    }

    var effectsData map[string]any
    if v, ok := data["effects"].(map[string]any); ok {
        effectsData = v
    } else {
        effectsData = map[string]any{}
    }

    for _, effect := range card.Effects {
        switch effect {
        case models.ExtraToken:
            gl.handleExtraTokenEffect(playerID, card.Color, effectsData)
        case models.Steal:
            gl.handleStealEffect(playerID, effectsData)
        case models.Wildcard:
            gl.handleWildcardEffect(playerID, card, effectsData)
        default:
            // 其他需要确认的效果后续实现
        }
    }

    // 处理贵族选择（若传入）
    if nobleRaw, ok := effectsData["noble"].(map[string]any); ok {
        gl.handleNobleSelection(playerID, nobleRaw)
    }
}

// 处理贵族选择与效果结算（noble2: +2分+新回合；noble3: +2分+特权；noble4: +3分）
func (gl *GameLogic) handleNobleSelection(playerID string, nobleData map[string]any) bool {
    id, _ := nobleData["id"].(string)
    if id == "" {
        return false
    }
    player := gl.getPlayer(playerID)
    if player == nil {
        return false
    }

    for _, n := range player.Nobles {
        if n == id {
            return false
        }
    }

    switch id {
    case "noble2":
        player.Points += 2
        if gl.gameState.ExtraTurns == nil {
            gl.gameState.ExtraTurns = map[string]int{}
        }
        gl.gameState.ExtraTurns[playerID]++
    case "noble3":
        player.Points += 2
        _ = gl.TakePrivilegeToken(playerID)
    case "noble4":
        player.Points += 3
    default:
        return false
    }

    player.Nobles = append(player.Nobles, id)
    // 从场上可用贵族中移除
    var filtered []string
    for _, nid := range gl.gameState.AvailableNobles {
        if nid != id {
            filtered = append(filtered, nid)
        }
    }
    gl.gameState.AvailableNobles = filtered
    return true
}

// handleExtraTokenEffect 处理额外token效果：
// - 前端可在effects.extraToken传入 { selectedGem: {x:int, y:int} } 或 { skipped: true }
// - 只允许拿取与卡牌颜色相同的一个token
func (gl *GameLogic) handleExtraTokenEffect(playerID string, cardColor models.GemType, effectsData map[string]any) bool {
    extraRaw, ok := effectsData["extraToken"].(map[string]any)
    // 未提供数据则视为无效
    if !ok {
        return false
    }

	// 跳过则直接返回成功
    if skipped, ok := extraRaw["skipped"].(bool); ok && skipped {
        return true
    }

    sel, ok := extraRaw["selectedGem"].(map[string]any)
    if !ok {
        return false
    }

    var x, y int
    if xv, ok := sel["x"].(float64); ok { x = int(xv) }
    if yv, ok := sel["y"].(float64); ok { y = int(yv) }

    if x < 0 || y < 0 || x >= len(gl.gameState.GemBoard) || y >= len(gl.gameState.GemBoard[0]) {
        return false
    }

	// 判断宝石位置有效性
    gem := gl.gameState.GemBoard[x][y]
    if gem == "" {
        return false
    }

	// 判断宝石颜色是否匹配
    if gem != cardColor || gem == models.GemGold {
        return false
    }

    gl.gameState.GemBoard[x][y] = ""
    player := gl.getPlayer(playerID)
    if player == nil {
        return false
    }
    player.Gems[gem]++
    return true
}

// handleStealEffect 处理窃取效果：
// - 前端通过 effects.steal 传入 { gemType: 'white'|'blue'|'green'|'red'|'black' } 或 { skipped: true }
// - 从对手处窃取一个对应的非黄金token
func (gl *GameLogic) handleStealEffect(playerID string, effectsData map[string]any) bool {
    stealRaw, ok := effectsData["steal"].(map[string]any)
    if !ok {
        return false
    }

    if skipped, ok := stealRaw["skipped"].(bool); ok && skipped {
        return true
    }

    gemStr, ok := stealRaw["gemType"].(string)
    if !ok {
        return false
    }
    gemType := models.GemType(gemStr)
    if gemType == models.GemGold || gemType == "" {
		return false
    }

    // 找到对手
    opponentIdx := 1 - gl.getPlayerIndex(playerID)
    if opponentIdx < 0 || opponentIdx >= len(gl.gameState.Players) {
        return false
    }
    opponent := &gl.gameState.Players[opponentIdx]
    if opponent.Gems[gemType] <= 0 {
        return false
    }

    // 执行窃取
    opponent.Gems[gemType]--
    player := gl.getPlayer(playerID)
    if player == nil {
        // 回滚
        opponent.Gems[gemType]++
        return false
    }
    player.Gems[gemType]++
    return true
}

// handleWildcardEffect 处理百搭颜色效果：
// - 前端通过 effects.wildcard 传入 { color: 'white'|'blue'|'green'|'red'|'black' } 或 { skipped: true }
// - 调整玩家bonus：将本卡默认计入的灰色bonus转移到所选颜色
func (gl *GameLogic) handleWildcardEffect(playerID string, card *DevelopmentCardData, effectsData map[string]any) bool {
    wildRaw, ok := effectsData["wildcard"].(map[string]any)
    if !ok {
        return false
    }
    if skipped, ok := wildRaw["skipped"].(bool); ok && skipped {
        return true
    }
    colorStr, ok := wildRaw["color"].(string)
    if !ok {
        return false
    }
    chosen := models.GemType(colorStr)
    switch chosen {
    case models.GemWhite, models.GemBlue, models.GemGreen, models.GemRed, models.GemBlack:
        // ok
    default:
        return false
    }

    player := gl.getPlayer(playerID)
    if player == nil {
        return false
    }

    // 将灰色bonus（若已加）转移为所选颜色
    if card.Bonus == models.GemGray {
        if player.Bonus[models.GemGray] > 0 {
            player.Bonus[models.GemGray]--
        }
    }
    card.Color = chosen
    card.Bonus = chosen
    player.Bonus[chosen]++

    // 同步运行时卡牌详情映射，便于前端tooltip正确归类
    if cd, ok := gl.gameState.CardDetails[card.ID]; ok {
        cd.Bonus = chosen
        cd.Color = chosen
        gl.gameState.CardDetails[card.ID] = cd
    }
    if cm, ok := gl.gameState.CardMap[card.ID]; ok {
        cm.Bonus = chosen
        cm.Color = chosen
        gl.gameState.CardMap[card.ID] = cm
    }
    // 移除灰色奖励显示
    delete(player.Bonus, models.GemGray)
    return true
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
