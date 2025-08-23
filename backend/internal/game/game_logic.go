package game

import (
	"errors"
	"splendor-duel-backend/internal/models"
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
	Data      map[string]interface{}      `json:"data"`
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

// ExecuteTurn 执行玩家回合
func (gl *GameLogic) ExecuteTurn(playerID string, actions []GameAction) error {
	// 验证玩家身份
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 执行可选行动
	optionalActions := 0
	for _, action := range actions {
		switch action.Type {
		case ActionSpendPrivilege:
			if err := gl.executeSpendPrivilege(playerID, action.Data); err != nil {
				return err
			}
			optionalActions++
		case ActionRefillBoard:
			if err := gl.executeRefillBoard(playerID, action.Data); err != nil {
				return err
			}
			optionalActions++
		}
	}
	
	// 验证可选行动数量
	if optionalActions > 2 {
		return errors.New("可选行动不能超过2个")
	}
	
	// 执行强制行动
	mandatoryAction := gl.findMandatoryAction(actions)
	if mandatoryAction == nil {
		// 如果没有强制行动，必须执行补充版图+拿取宝石
		if err := gl.executeRefillBoard(playerID, nil); err != nil {
			return err
		}
		if err := gl.executeTakeGems(playerID, gl.findTakeGemsAction(actions)); err != nil {
			return err
		}
	} else {
		if err := gl.executeMandatoryAction(playerID, mandatoryAction); err != nil {
			return err
		}
	}
	
	// 回合结束处理
	if err := gl.handleTurnEnd(playerID); err != nil {
		return err
	}
	
	// 检查胜利条件
	if winner := gl.checkVictoryConditions(); winner != "" {
		gl.gameState.Status = models.GameStatusFinished
		gl.gameState.Winner = winner
		return nil
	}
	
	// 切换到下一个玩家
	gl.nextTurn()
	
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
}

// 初始化发展卡
func (gl *GameLogic) initializeDevelopmentCards() {
	// 获取所有发展卡
	allCards := GetAllDevelopmentCards()
	
	// 按等级分组
	var level1Cards, level2Cards, level3Cards []DevelopmentCardData
	for _, card := range allCards {
		switch card.Level {
		case models.Level1:
			level1Cards = append(level1Cards, card)
		case models.Level2:
			level2Cards = append(level2Cards, card)
		case models.Level3:
			level3Cards = append(level3Cards, card)
		}
	}
	
	// 设置未翻开的卡牌
	gl.gameState.UnflippedCards = map[models.CardLevel]int{
		models.Level1: len(level1Cards),
		models.Level2: len(level2Cards),
		models.Level3: len(level3Cards),
	}
	
	// 翻开初始卡牌
	gl.gameState.FlippedCards = map[models.CardLevel][]string{
		models.Level1: gl.getRandomCardIDs(level1Cards, 5),
		models.Level2: gl.getRandomCardIDs(level2Cards, 4),
		models.Level3: gl.getRandomCardIDs(level3Cards, 3),
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

// 获取随机卡牌ID
func (gl *GameLogic) getRandomCardIDs(cards []DevelopmentCardData, count int) []string {
	if len(cards) <= count {
		count = len(cards)
	}
	
	// 创建卡牌副本并随机打乱
	shuffledCards := make([]DevelopmentCardData, len(cards))
	copy(shuffledCards, cards)
	
	// Fisher-Yates 洗牌算法
	for i := len(shuffledCards) - 1; i > 0; i-- {
		j := gl.getRandomInt(0, i)
		shuffledCards[i], shuffledCards[j] = shuffledCards[j], shuffledCards[i]
	}
	
	var ids []string
	for i := 0; i < count; i++ {
		ids = append(ids, shuffledCards[i].ID)
	}
	
	return ids
}

// 执行花费特权指示物
func (gl *GameLogic) executeSpendPrivilege(playerID string, data map[string]interface{}) error {
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	// 获取要花费的特权指示物数量
	privilegeCount, ok := data["privilegeCount"].(float64)
	if !ok {
		return errors.New("缺少特权指示物数量")
	}
	
	count := int(privilegeCount)
	if count <= 0 || count > player.PrivilegeTokens {
		return errors.New("特权指示物数量无效")
	}
	
	// 获取要拿取的宝石坐标
	gemPositions, ok := data["gemPositions"].([]interface{})
	if !ok {
		return errors.New("缺少宝石坐标")
	}
	
	if len(gemPositions) != count {
		return errors.New("宝石数量与特权指示物数量不匹配")
	}
	
	// 验证并拿取宝石
	for _, pos := range gemPositions {
		posMap, ok := pos.(map[string]interface{})
		if !ok {
			return errors.New("宝石坐标格式错误")
		}
		
		x, ok := posMap["x"].(float64)
		if !ok {
			return errors.New("缺少x坐标")
		}
		
		y, ok := posMap["y"].(float64)
		if !ok {
			return errors.New("缺少y坐标")
		}
		
		if err := gl.takeGemFromBoard(int(x), int(y), playerID); err != nil {
			return err
		}
	}
	
	// 扣除特权指示物
	player.PrivilegeTokens -= count
	gl.gameState.AvailablePrivilegeTokens += count
	
	return nil
}

// 执行补充版图
func (gl *GameLogic) executeRefillBoard(playerID string, data map[string]interface{}) error {
	// 对手获得特权指示物
	opponentID := gl.getOpponentID(playerID)
	if opponentID != "" {
		opponent := gl.getPlayer(opponentID)
		if opponent != nil && opponent.PrivilegeTokens < 3 {
			opponent.PrivilegeTokens++
			gl.gameState.AvailablePrivilegeTokens--
		}
	}
	
	// 按照指定顺序补充宝石版图
	refillOrder := [][]int{
		{2, 2}, {2, 3}, // 2,2 至 2,3（往下）
		{1, 3}, {1, 2}, {1, 1}, // 1,3 至 1,1（往上）
		{2, 1}, {3, 1}, // 2,1 至 3,1（往右）
		{3, 2}, {3, 3}, {3, 4}, // 3,2 至 3,4（往下）
		{2, 4}, {1, 4}, {0, 4}, // 2,4 至 0,4（往左）
		{0, 3}, {0, 2}, {0, 1}, {0, 0}, // 0,3 至 0,0（往上）
		{1, 0}, {2, 0}, {3, 0}, {4, 0}, // 1,0 至 4,0（往右）
		{4, 1}, {4, 2}, {4, 3}, {4, 4}, // 4,1 至 4,4（往下）
	}
	
	for _, pos := range refillOrder {
		x, y := pos[0], pos[1]
		if gl.gameState.GemBoard[x][y] == models.GemType("") && gl.gameState.GemsInBag > 0 {
			// 从宝石袋子中随机选择一个宝石类型
			gemType := gl.getRandomGemType()
			gl.gameState.GemBoard[x][y] = gemType
			gl.gameState.GemsInBag--
		}
	}
	
	return nil
}

// 执行拿取宝石
func (gl *GameLogic) executeTakeGems(playerID string, action *GameAction) error {
	if action == nil {
		return errors.New("缺少拿取宝石行动")
	}
	
	// 获取要拿取的宝石坐标
	gemPositions, ok := action.Data["gemPositions"].([]interface{})
	if !ok {
		return errors.New("缺少宝石坐标")
	}
	
	if len(gemPositions) < 1 || len(gemPositions) > 3 {
		return errors.New("一次只能拿取1-3个宝石")
	}
	
	// 验证宝石是否在一条直线上且连续
	if !gl.validateGemLine(gemPositions) {
		return errors.New("宝石必须在一条直线上且连续")
	}
	
	// 拿取宝石
	for _, pos := range gemPositions {
		posMap, ok := pos.(map[string]interface{})
		if !ok {
			return errors.New("宝石坐标格式错误")
		}
		
		x, ok := posMap["x"].(float64)
		if !ok {
			return errors.New("缺少x坐标")
		}
		
		y, ok := posMap["y"].(float64)
		if !ok {
			return errors.New("缺少y坐标")
		}
		
		if err := gl.takeGemFromBoard(int(x), int(y), playerID); err != nil {
			return err
		}
	}
	
	return nil
}

// 执行购买发展卡
func (gl *GameLogic) executeBuyCard(playerID string, action *GameAction) error {
	cardID, ok := action.Data["cardId"].(string)
	if !ok {
		return errors.New("缺少卡牌ID")
	}
	
	// 获取卡牌信息
	card := GetCardByID(cardID)
	if card == nil {
		return errors.New("卡牌不存在")
	}
	
	// 检查玩家是否有足够的宝石
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	// 计算应支付费用
	requiredGems := gl.calculateRequiredGems(card, player)
	
	// 验证玩家是否有足够的宝石
	if !gl.playerHasEnoughGems(player, requiredGems) {
		return errors.New("宝石不足")
	}
	
	// 扣除宝石
	gl.deductGemsFromPlayer(player, requiredGems)
	
	// 将宝石放回袋子
	for _, count := range requiredGems {
		gl.gameState.GemsInBag += count
	}
	
	// 将卡牌添加到玩家手中
	player.DevelopmentCards = append(player.DevelopmentCards, cardID)
	player.Bonus[card.Bonus]++
	player.Points += card.Points
	player.Crowns += card.Crowns
	
	// 从场上移除卡牌
	gl.removeCardFromBoard(cardID)
	
	// 结算一次性效果
	gl.resolveCardEffects(card, playerID)
	
	// 补充翻开的卡牌
	gl.refillFlippedCards(card.Level)
	
	return nil
}

// 执行保留发展卡
func (gl *GameLogic) executeReserveCard(playerID string, action *GameAction) error {
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	// 检查预购条件
	if len(player.ReservedCards) >= 3 {
		return errors.New("已经预购了3张发展卡")
	}
	
	// 检查是否有黄金token
	hasGold := false
	for x := 0; x < 5; x++ {
		for y := 0; y < 5; y++ {
			if gl.gameState.GemBoard[x][y] == models.GemGold {
				hasGold = true
				break
			}
		}
		if hasGold {
			break
		}
	}
	
	if !hasGold {
		return errors.New("宝石版图没有黄金token")
	}
	
	// 获取黄金token坐标
	goldX, ok := action.Data["goldX"].(float64)
	if !ok {
		return errors.New("缺少黄金token的x坐标")
	}
	
	goldY, ok := action.Data["goldY"].(float64)
	if !ok {
		return errors.New("缺少黄金token的y坐标")
	}
	
	// 拿取黄金token
	if err := gl.takeGemFromBoard(int(goldX), int(goldY), playerID); err != nil {
		return err
	}
	
	// 处理保留的卡牌
	cardID, ok := action.Data["cardId"].(string)
	if ok && cardID != "" {
		// 保留场上翻开的卡牌
		gl.removeCardFromBoard(cardID)
		player.ReservedCards = append(player.ReservedCards, cardID)
		gl.refillFlippedCards(GetCardByID(cardID).Level)
	} else {
		// 从牌堆盲抽
		level, ok := action.Data["level"].(float64)
		if !ok {
			return errors.New("缺少卡牌等级")
		}
		
		cardLevel := models.CardLevel(int(level))
		if gl.gameState.UnflippedCards[cardLevel] > 0 {
			// 从对应等级的牌堆顶盲抽一张
			card := gl.drawCardFromDeck(cardLevel)
			if card != nil {
				player.ReservedCards = append(player.ReservedCards, card.ID)
			}
		}
	}
	
	return nil
}

// 验证宝石是否在一条直线上且连续
func (gl *GameLogic) validateGemLine(positions []interface{}) bool {
	if len(positions) < 2 {
		return true
	}
	
	// 获取第一个位置
	firstPos, ok := positions[0].(map[string]interface{})
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
		pos, ok := positions[i].(map[string]interface{})
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

// 从版图拿取宝石
func (gl *GameLogic) takeGemFromBoard(x, y int, playerID string) error {
	if x < 0 || x >= 5 || y < 0 || y >= 5 {
		return errors.New("坐标超出范围")
	}
	
	gemType := gl.gameState.GemBoard[x][y]
	if gemType == models.GemType("") {
		return errors.New("该位置没有宝石")
	}
	
	// 将宝石添加到玩家手中
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	player.Gems[gemType]++
	
	// 从版图移除宝石
	gl.gameState.GemBoard[x][y] = models.GemType("")
	
	return nil
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

// 检查玩家是否有足够的宝石
func (gl *GameLogic) playerHasEnoughGems(player *models.Player, required map[models.GemType]int) bool {
	for gemType, count := range required {
		if player.Gems[gemType] < count {
			return false
		}
	}
	return true
}

// 从玩家扣除宝石
func (gl *GameLogic) deductGemsFromPlayer(player *models.Player, gems map[models.GemType]int) {
	for gemType, count := range gems {
		player.Gems[gemType] -= count
	}
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
	targetCount := 5
	if level == models.Level2 {
		targetCount = 4
	} else if level == models.Level3 {
		targetCount = 3
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

// 从牌堆抽取卡牌
func (gl *GameLogic) drawCardFromDeck(level models.CardLevel) *DevelopmentCardData {
	if gl.gameState.UnflippedCards[level] <= 0 {
		return nil
	}
	
	// 简化处理，总是抽取第一张
	levelCards := GetCardsByLevel(level)
	if len(levelCards) > 0 {
		gl.gameState.UnflippedCards[level]--
		return &levelCards[0]
	}
	
	return nil
}

// 回合结束处理
func (gl *GameLogic) handleTurnEnd(playerID string) error {
	player := gl.getPlayer(playerID)
	if player == nil {
		return errors.New("玩家不存在")
	}
	
	// 检查皇冠数，触发贵族效果
	if player.Crowns >= 3 && len(player.Nobles) == 0 {
		// 选择第一个贵族
		gl.awardNoble(playerID, "noble1")
	}
	if player.Crowns >= 6 && len(player.Nobles) == 1 {
		// 选择第二个贵族
		gl.awardNoble(playerID, "noble2")
	}
	
	// 检查token数量
	totalGems := 0
	for _, count := range player.Gems {
		totalGems += count
	}
	
	if totalGems > 10 {
		// 需要丢弃多余的token（简化处理，随机丢弃）
		excess := totalGems - 10
		gl.discardExcessGems(player, excess)
	}
	
	return nil
}

// 授予贵族
func (gl *GameLogic) awardNoble(playerID, nobleID string) {
	player := gl.getPlayer(playerID)
	if player == nil {
		return
	}
	
	// 根据贵族ID设置效果
	switch nobleID {
	case "noble1": // 2分&窃取
		player.Points += 2
		// 窃取效果需要玩家选择，暂时跳过
	case "noble2": // 2分&新的回合
		player.Points += 2
		gl.gameState.ExtraTurns[playerID]++
	case "noble3": // 2分&获取特权
		player.Points += 2
		if player.PrivilegeTokens < 3 {
			player.PrivilegeTokens++
			gl.gameState.AvailablePrivilegeTokens--
		}
	case "noble4": // 3分
		player.Points += 3
	}
	
	player.Nobles = append(player.Nobles, nobleID)
}

// 丢弃多余的宝石
func (gl *GameLogic) discardExcessGems(player *models.Player, excess int) {
	// 简化处理，随机丢弃
	discarded := 0
	for gemType, count := range player.Gems {
		if discarded >= excess {
			break
		}
		
		if count > 0 {
			discard := min(count, excess-discarded)
			player.Gems[gemType] -= discard
			discarded += discard
		}
	}
}

// 检查胜利条件
func (gl *GameLogic) checkVictoryConditions() string {
	for _, player := range gl.gameState.Players {
		// 条件1：总分达到20
		if player.Points >= 20 {
			return player.ID
		}
		
		// 条件2：皇冠数达到10
		if player.Crowns >= 10 {
			return player.ID
		}
		
		// 条件3：某一颜色发展卡总分达到10
		for color, bonus := range player.Bonus {
			if color != models.GemGray && bonus >= 10 {
				return player.ID
			}
		}
	}
	
	return ""
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

// 获取随机宝石类型
func (gl *GameLogic) getRandomGemType() models.GemType {
	gemTypes := []models.GemType{
		models.GemWhite, models.GemBlue, models.GemGreen, models.GemRed, models.GemBlack,
	}
	return gemTypes[gl.gameState.TurnNumber%len(gemTypes)] // 简化随机
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

// 获取对手ID
func (gl *GameLogic) getOpponentID(playerID string) string {
	for _, player := range gl.gameState.Players {
		if player.ID != playerID {
			return player.ID
		}
	}
	return ""
}

// 查找强制行动
func (gl *GameLogic) findMandatoryAction(actions []GameAction) *GameAction {
	for _, action := range actions {
		if action.Type == ActionTakeGems || action.Type == ActionBuyCard || action.Type == ActionReserveCard {
			return &action
		}
	}
	return nil
}

// 查找拿取宝石行动
func (gl *GameLogic) findTakeGemsAction(actions []GameAction) *GameAction {
	for _, action := range actions {
		if action.Type == ActionTakeGems {
			return &action
		}
	}
	return nil
}

// 执行强制行动
func (gl *GameLogic) executeMandatoryAction(playerID string, action *GameAction) error {
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

// 最小值函数
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// TakeGems 拿取宝石
func (gl *GameLogic) TakeGems(playerID string, gemPositions []map[string]interface{}) error {
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
	var positions []interface{}
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

// BuyCard 购买发展卡
func (gl *GameLogic) BuyCard(playerID string, cardID string) error {
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 这里需要实现购买发展卡的逻辑
	// 包括费用计算、宝石扣除、卡牌获取等
	
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
	
	// 将黄金添加到玩家手中
	gl.gameState.Players[playerIndex].Gems["gold"]++
	
	// 从版图上移除黄金
	gl.gameState.GemBoard[goldX][goldY] = ""
	
	// 这里需要实现保留发展卡的逻辑
	// 包括卡牌获取、补充版图等
	
	// 切换到下一个玩家
	gl.nextTurn()
	
	return nil
}

// SpendPrivilege 花费特权指示物
func (gl *GameLogic) SpendPrivilege(playerID string, privilegeCount int, gemPositions []map[string]interface{}) error {
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
	playerIndex := gl.getPlayerIndex(playerID)
	if playerIndex == -1 {
		return errors.New("玩家不存在")
	}
	
	if gl.gameState.CurrentPlayerIndex != playerIndex {
		return errors.New("不是该玩家的回合")
	}
	
	// 从袋子中补充宝石到版图
	for row := 0; row < 5; row++ {
		for col := 0; col < 5; col++ {
			if gl.gameState.GemBoard[row][col] == "" && gl.gameState.GemsInBag > 0 {
				// 随机选择一个宝石类型
				gemType := gl.getRandomGemType()
				gl.gameState.GemBoard[row][col] = gemType
				gl.gameState.GemsInBag--
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
