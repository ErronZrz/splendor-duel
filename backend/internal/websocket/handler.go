package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"splendor-duel-backend/internal/game"
	"splendor-duel-backend/internal/models"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源，生产环境应该限制
	},
}

// Client WebSocket 客户端
type Client struct {
	ID       string
	RoomID   string
	PlayerID string
	Conn     *websocket.Conn
	Send     chan []byte
	Manager  *game.Manager
}

// Room WebSocket 房间
type Room struct {
	ID      string
	Clients map[*Client]bool
	Manager *game.Manager
	mutex   sync.RWMutex
	// 历史缓存：仅用于客户端重连回放
	ChatMessages []models.ChatMessage
	GameHistory  []models.GameAction
}

// Hub WebSocket 中心
type Hub struct {
	Rooms map[string]*Room
	mutex sync.RWMutex
}

// NewHub 创建新的 Hub
func NewHub() *Hub {
	return &Hub{
		Rooms: make(map[string]*Room),
	}
}

// HandleWebSocket 处理 WebSocket 连接
func HandleWebSocket(w http.ResponseWriter, r *http.Request, roomID string, gameManager *game.Manager) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}

	// 创建客户端
	client := &Client{
		ID:      generateClientID(),
		RoomID:  roomID,
		Conn:    conn,
		Send:    make(chan []byte, 256),
		Manager: gameManager,
	}

	// 获取或创建房间
	hub := getHub()
	room := hub.getOrCreateRoom(roomID, gameManager)

	// 注册客户端
	room.registerClient(client)

	// 启动客户端协程
	go client.writePump()
	go client.readPump()
}

// 全局 Hub 实例
var globalHub *Hub

func init() {
	globalHub = NewHub()
}

func getHub() *Hub {
	return globalHub
}

// getOrCreateRoom 获取或创建房间
func (h *Hub) getOrCreateRoom(roomID string, gameManager *game.Manager) *Room {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.Rooms[roomID]; exists {
		return room
	}

	room := &Room{
		ID:      roomID,
		Clients: make(map[*Client]bool),
		Manager: gameManager,
	}

	h.Rooms[roomID] = room
	return room
}

// registerClient 注册客户端
func (r *Room) registerClient(client *Client) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	r.Clients[client] = true
	log.Printf("客户端 %s 加入房间 %s", client.ID, r.ID)

	// 发送房间信息
	r.broadcastToClient(client, models.WSMessage{
		Type: "room_info",
		Data: r.Manager.GetRoom(r.ID),
	})

	// 回放历史（仅此客户端）
	if len(r.ChatMessages) > 0 || len(r.GameHistory) > 0 {
		// 聊天与历史快照（仅给当前客户端）
		snapshot := map[string]any{
			"chat":    r.ChatMessages,
			"history": r.GameHistory,
		}
		r.broadcastToClient(client, models.WSMessage{
			Type: "history_snapshot",
			Data: snapshot,
		})
	}
}

// unregisterClient 注销客户端
func (r *Room) unregisterClient(client *Client) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	if _, ok := r.Clients[client]; ok {
		delete(r.Clients, client)
		close(client.Send)
		log.Printf("客户端 %s 离开房间 %s", client.ID, r.ID)
	}
}

// broadcastToClient 向特定客户端广播消息
func (r *Room) broadcastToClient(client *Client, message models.WSMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("消息序列化失败: %v", err)
		return
	}

	select {
	case client.Send <- data:
	default:
		r.unregisterClient(client)
	}
}

// broadcastToAll 向所有客户端广播消息
func (r *Room) broadcastToAll(message models.WSMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("消息序列化失败: %v", err)
		return
	}

	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for client := range r.Clients {
		select {
		case client.Send <- data:
		default:
			r.unregisterClient(client)
		}
	}
}

// readPump 读取消息泵
func (c *Client) readPump() {
	defer func() {
		c.cleanup()
	}()

	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket 读取错误: %v", err)
			}
			break
		}

		c.handleMessage(message)
	}
}

// writePump 写入消息泵
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.cleanup()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage 处理接收到的消息
func (c *Client) handleMessage(message []byte) {
	var wsMessage models.WSMessage
	if err := json.Unmarshal(message, &wsMessage); err != nil {
		log.Printf("消息解析失败: %v", err)
		return
	}

	// 设置玩家ID
	if wsMessage.PlayerID != "" {
		c.PlayerID = wsMessage.PlayerID
	}

	// 获取房间
	hub := getHub()
	room := hub.Rooms[c.RoomID]
	if room == nil {
		return
	}

	switch wsMessage.Type {
	case "player_join":
		c.handlePlayerJoin(wsMessage, room)
	case "chat_message":
		c.handleChatMessage(wsMessage, room)
	case "game_action":
		c.handleGameAction(wsMessage, room)
	case "start_game":
		c.handleStartGame(room)
	default:
		log.Printf("未知消息类型: %s", wsMessage.Type)
	}
}

// handlePlayerJoin 处理玩家加入
func (c *Client) handlePlayerJoin(message models.WSMessage, room *Room) {
	// 设置客户端的玩家ID
	c.PlayerID = message.PlayerID
	
	// 广播玩家加入消息
	room.broadcastToAll(models.WSMessage{
		Type: "player_joined",
		Data: map[string]any{
			"playerId":   message.PlayerID,
			"playerName": message.PlayerName,
		},
	})

	// 更新游戏状态并检查是否应该开始游戏
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		// 检查玩家是否已经存在
		playerExists := false
		for i, player := range roomData.GameState.Players {
			if player.ID == message.PlayerID {
				roomData.GameState.Players[i].LastActive = time.Now()
				playerExists = true
				break
			}
		}
		
		// 如果玩家不存在，添加新玩家
		if !playerExists {
			roomData.GameState.Players = append(roomData.GameState.Players, models.Player{
				ID:          message.PlayerID,
				Name:        message.PlayerName,
				LastActive:  time.Now(),
				Gems:        make(map[models.GemType]int),
				Bonus:       make(map[models.GemType]int),
				ReservedCards: []string{},
				Crowns:      0,
				PrivilegeTokens: 0,
				Points:      0,
			})
		}
		
		// 检查是否应该自动开始游戏（当有2个玩家且状态为waiting时）
		if len(roomData.GameState.Players) >= 2 && roomData.GameState.Status == models.GameStatusWaiting {
			log.Printf("房间 %s 有 %d 个玩家，自动开始游戏", c.RoomID, len(roomData.GameState.Players))
			
			// 创建游戏逻辑实例并开始游戏
			gl := game.NewGameLogic(&roomData.GameState, room.Manager)
			if err := gl.StartGame(); err != nil {
				log.Printf("自动开始游戏失败: %v", err)
				return
			}
			
			roomData.GameState.StartedAt = time.Now()
			log.Printf("游戏已自动开始")
		}
	})

	// 获取最新的游戏状态
	latestRoom := room.Manager.GetRoom(c.RoomID)
	latestGameState := latestRoom.GameState
	
	// 广播更新后的游戏状态
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &latestGameState,
	})
	
	// 如果游戏已开始，广播游戏开始消息
	if latestGameState.Status == models.GameStatusPlaying {
		room.broadcastToAll(models.WSMessage{
			Type: "game_start",
			Data: latestRoom,
		})
	}
}

// handleChatMessage 处理聊天消息
func (c *Client) handleChatMessage(message models.WSMessage, room *Room) {
	chatMessage := models.ChatMessage{
		ID:         generateClientID(),
		PlayerID:   message.PlayerID,
		PlayerName: message.PlayerName,
		Message:    message.Message,
		Timestamp:  time.Now(),
	}

	// 保存到房间聊天历史（用于重连回放）
	room.mutex.Lock()
	room.ChatMessages = append(room.ChatMessages, chatMessage)
	room.mutex.Unlock()

	// 广播聊天消息
	room.broadcastToAll(models.WSMessage{
		Type:       "chat_message",
		PlayerID:   chatMessage.PlayerID,
		PlayerName: chatMessage.PlayerName,
		Message:    chatMessage.Message,
	})
}

func histGemImg(g string) string {
	if g == "" { return "" }
	return fmt.Sprintf(`<img class="hist-gem" src="/images/gems/%s.jpg" alt="%s" />`, g, g)
}
func histCardLink(id string) string {
	if id == "" { return "发展卡" }
	// 使用 span + data-preview 实现悬停预览，不提供跳转
	return fmt.Sprintf(`<span class="hist-link" data-preview="/images/cards/%s.jpg">发展卡</span>`, id)
}
func histNobleLink(id string) string {
	if id == "" { return "贵族" }
	// 使用 span + data-preview 实现悬停预览，不提供跳转
	return fmt.Sprintf(`<span class="hist-link" data-preview="/images/nobles/%s.jpg">贵族</span>`, id)
}

func broadcastHistory(room *Room, playerID, playerName, desc, html string) {
	ga := models.GameAction{
		ID:              generateClientID(),
		PlayerID:        playerID,
		PlayerName:      playerName,
		Type:            "history",
		Timestamp:       time.Now(),
		Description:     desc,
		DescriptionHTML: html,
	}

	// 保存到房间历史（用于重连回放）
	room.mutex.Lock()
	room.GameHistory = append(room.GameHistory, ga)
	room.mutex.Unlock()

	room.broadcastToAll(models.WSMessage{ Type: "game_action", Action: &ga })
}

// handleGameAction 处理游戏动作
func (c *Client) handleGameAction(message models.WSMessage, room *Room) {
	log.Printf("处理游戏动作: %s, 玩家: %s, 数据: %+v", message.Type, message.PlayerName, message.Data)
	
	// 安全检查：确保Data不为nil
	if message.Data == nil {
		log.Printf("警告: 游戏动作数据为nil，跳过处理")
		return
	}
	
	// 尝试将Data转换为map[string]any
	data, ok := message.Data.(map[string]any)
	if !ok {
		log.Printf("警告: 无法将Data转换为map[string]any，跳过处理")
		return
	}
	
	// 执行游戏逻辑
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		// 创建游戏逻辑实例
		gl := game.NewGameLogic(&roomData.GameState, room.Manager)
		
		// 根据动作类型执行相应的游戏逻辑
		// 前端发送的actionType在消息的顶层，data在消息的data字段中
		actionType := message.ActionType
		if actionType == "" {
			log.Printf("无法获取actionType: %+v", message.ActionType)
			return
		}
		
		log.Printf("解析到actionType: %s", actionType)
		
		switch actionType {
		case "start_game":
			log.Printf("执行开始游戏操作")
			if roomData.GameState.Status == models.GameStatusPlaying {
				log.Printf("游戏已经开始，跳过重复开始操作")
				return
			}
			if len(roomData.GameState.Players) >= 2 {
				if err := gl.StartGame(); err != nil {
					log.Printf("开始游戏失败: %v", err)
					return
				}
				roomData.GameState.StartedAt = time.Now()
				log.Printf("游戏已手动开始")
			} else {
				log.Printf("玩家数量不足，无法开始游戏")
				return
			}
		case "takeGems":
			if gemPositions, ok := data["gemPositions"].([]any); ok {
				log.Printf("执行拿取宝石操作，位置: %+v", gemPositions)
				var positions []map[string]any
				for _, pos := range gemPositions { if posMap, ok := pos.(map[string]any); ok { positions = append(positions, posMap) } }
				// 预生成图片与类型（使用操作前的版图）
				var pics []string
				var types []string
				for _, p := range positions {
					x := int(p["x"].(float64)); y := int(p["y"].(float64))
					g := string(roomData.GameState.GemBoard[x][y])
					types = append(types, g)
					pics = append(pics, histGemImg(g))
				}
				if err := gl.TakeGems(message.PlayerID, positions); err != nil {
					log.Printf("拿取宝石失败: %v", err)
				} else {
					// 检查是否触发让对手获得特权条件：3同色（非gold）或包含2枚珍珠
					grant := false
					if len(types) == 3 {
						same := (types[0] == types[1] && types[1] == types[2] && types[0] != "gold")
						grant = grant || same
					}
					pearl := 0
					for _, t := range types { if t == "pearl" { pearl++ } }
					if pearl >= 2 { grant = true }
					html := fmt.Sprintf("拿取宝石：%s", strings.Join(pics, ""))
					if grant { html += "，允许对手获取一个特权指示物" }
					desc := "拿取宝石"
					broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
				}
			}
		case "buyCard":
			if cardID, ok := data["cardId"].(string); ok {
				log.Printf("执行购买发展卡操作，卡牌ID: %s", cardID)
				// 预处理：支付、特效与来源
				paymentPlan, _ := data["paymentPlan"].(map[string]any)
				var pics []string
				totalPay := 0
				for k, v := range paymentPlan {
					if cnt, ok := v.(float64); ok {
						c := int(cnt); totalPay += c
						for i:=0;i<c;i++{ pics = append(pics, histGemImg(k)) }
					}
				}
				// 查找当前玩家索引
				idx := -1
				for i, p := range roomData.GameState.Players { if p.ID == message.PlayerID { idx = i; break } }
				if idx < 0 { idx = 0 }
				before := roomData.GameState.Players[idx]
				wasReserved := false
				for _, rc := range before.ReservedCards { if rc == cardID { wasReserved = true; break } }
				// 预取特效信息
				effects, _ := data["effects"].(map[string]any)
				var extraPic string
				if extraRaw, ok := effects["extraToken"].(map[string]any); ok {
					if sel, ok := extraRaw["selectedGem"].(map[string]any); ok {
						x := int(sel["x"].(float64)); y := int(sel["y"].(float64))
						g := roomData.GameState.GemBoard[x][y]
						extraPic = histGemImg(string(g))
					}
				}
				stealGem := ""
				if stealRaw, ok := effects["steal"].(map[string]any); ok {
					if gs, ok := stealRaw["gemType"].(string); ok { stealGem = gs }
				}
				wildColor := ""
				if wildRaw, ok := effects["wildcard"].(map[string]any); ok {
					if cs, ok := wildRaw["color"].(string); ok { wildColor = cs }
				}
				nobleId := ""
				if nobleRaw, ok := effects["noble"].(map[string]any); ok { if nid, ok := nobleRaw["id"].(string); ok { nobleId = nid } }
				// 执行购买
				if err := gl.BuyCardWithPaymentPlanAndEffects(message.PlayerID, data); err != nil {
					log.Printf("购买发展卡失败: %v", err)
				} else {
					// 组装购买历史
					cd := roomData.GameState.CardDetails[cardID]
					level := int(cd.Level)
					var html, desc string
					if totalPay <= 0 {
						html = fmt.Sprintf("免费拿取一张等级 %d 的%s", level, histCardLink(cardID))
						desc = "免费拿取发展卡"
					} else {
						source := "购买一张"
						if wasReserved { source = "从保留的发展卡购买一张" }
						html = fmt.Sprintf("花费 %s，%s等级 %d 的%s", strings.Join(pics, ""), source, level, histCardLink(cardID))
						desc = "购买发展卡"
					}
					broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					// 获得贵族
					if nobleId != "" {
						// 判定是第3还是第6皇冠（根据已有贵族数量）
						owned := len(before.Nobles)
						threshold := 3; if owned >= 1 { threshold = 6 }
						broadcastHistory(room, message.PlayerID, message.PlayerName, "获得贵族", fmt.Sprintf("因皇冠数达到 %d 获得%s", threshold, histNobleLink(nobleId)))
					}
					// 特殊效果历史
					// 额外token
					if extraPic != "" {
						broadcastHistory(room, message.PlayerID, message.PlayerName, "额外token", fmt.Sprintf("因发展卡效果，拿取额外的 %s", extraPic))
					}
					// 窃取
					if stealGem != "" {
						src := "发展卡效果"; if nobleId == "noble1" { src = "贵族效果" }
						broadcastHistory(room, message.PlayerID, message.PlayerName, "窃取", fmt.Sprintf("因%s，从对手处拿取一枚 %s", src, histGemImg(stealGem)))
					}
					// 百搭颜色
					if wildColor != "" {
						cn := map[string]string{"white":"白色","blue":"蓝色","green":"绿色","red":"红色","black":"黑色"}[wildColor]
						broadcastHistory(room, message.PlayerID, message.PlayerName, "百搭颜色", fmt.Sprintf("将百搭颜色卡放置在%s组中", cn))
					}
					// 新的回合/获取特权
					// 依据卡效果或贵族
					effArr := cd.Effects
					for _, e := range effArr {
						if e == models.NewTurn { broadcastHistory(room, message.PlayerID, message.PlayerName, "新的回合", "因发展卡效果，获得额外的回合") }
						if e == models.GetPrivilege { broadcastHistory(room, message.PlayerID, message.PlayerName, "获得特权", "因发展卡效果，获得一个特权指示物") }
					}
					if nobleId == "noble2" {
						broadcastHistory(room, message.PlayerID, message.PlayerName, "新的回合", "因贵族效果，获得额外的回合")
					}
					if nobleId == "noble3" {
						broadcastHistory(room, message.PlayerID, message.PlayerName, "获得特权", "因贵族效果，获得一个特权指示物")
					}
				}
			}
		case "reserveCard":
			if cardID, ok := data["cardId"].(string); ok {
				log.Printf("执行保留发展卡操作，卡牌ID: %s", cardID)
				var goldX, goldY int
				if goldXVal, ok := data["goldX"].(float64); ok { goldX = int(goldXVal) }
				if goldYVal, ok := data["goldY"].(float64); ok { goldY = int(goldYVal) }
				// 执行前后比较找出真实卡ID
				// 查找当前玩家索引
				idx := -1
				for i, p := range roomData.GameState.Players { if p.ID == message.PlayerID { idx = i; break } }
				if idx < 0 { idx = 0 }
				before := roomData.GameState.Players[idx].ReservedCards
				if err := gl.ReserveCard(message.PlayerID, cardID, goldX, goldY); err != nil {
					log.Printf("保留发展卡失败: %v", err)
				} else {
					after := roomData.GameState.Players[idx].ReservedCards
					actual := ""
					m := map[string]bool{}
					for _, id := range before { m[id] = true }
					for _, id := range after { if !m[id] { actual = id; break } }
					if actual == "" && len(after) > 0 { actual = after[len(after)-1] }
					// 区分来源：若 cardID 形如 deck_level_X，则为从牌堆保留，隐藏具体卡信息
					if strings.HasPrefix(cardID, "deck_level_") {
						lvlStr := strings.TrimPrefix(cardID, "deck_level_")
						level := 0
						if v, err := strconv.Atoi(lvlStr); err == nil { level = v }
						html := fmt.Sprintf("从牌堆保留一张等级 %d 的发展卡，并获得 1 枚黄金", level)
						desc := "保留发展卡并获得黄金"
						broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					} else {
						level := 0
						if cd, ok := roomData.GameState.CardDetails[actual]; ok { level = int(cd.Level) }
						html := fmt.Sprintf("保留一张等级 %d 的%s，并获得 1 枚黄金", level, histCardLink(actual))
						desc := "保留发展卡并获得黄金"
						broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					}
				}
			}
		case "spendPrivilege":
			if privilegeCount, ok := data["privilegeCount"].(float64); ok {
				log.Printf("执行花费特权操作，特权数量: %f", privilegeCount)
				if gemPositions, ok := data["gemPositions"].([]any); ok {
					var positions []map[string]any
					for _, pos := range gemPositions { if posMap, ok := pos.(map[string]any); ok { positions = append(positions, posMap) } }
					var inner []string
					for _, p := range positions { x := int(p["x"].(float64)); y := int(p["y"].(float64)); g := roomData.GameState.GemBoard[x][y]; inner = append(inner, histGemImg(string(g))) }
					if err := gl.SpendPrivilege(message.PlayerID, int(privilegeCount), positions); err != nil {
						log.Printf("花费特权失败: %v", err)
					} else {
						pics := strings.Join(inner, "")
						html := fmt.Sprintf("花费了 %d 特权指示物，拿取 %s", int(privilegeCount), pics)
						desc := "花费特权"
						broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					}
				}
			}
		case "refillBoard":
			log.Printf("执行补充版图操作")
			if err := gl.RefillBoard(message.PlayerID); err != nil {
				log.Printf("补充版图失败: %v", err)
			} else {
				log.Printf("补充版图成功")
				desc := "执行了补充版图，允许对手获取一个特权指示物"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, desc)
			}
		case "grantOpponentPrivilege":
			log.Printf("执行让对手获得特权指示物操作")
			if err := gl.GrantOpponentPrivilege(message.PlayerID); err != nil {
				log.Printf("让对手获得特权指示物失败: %v", err)
			} else {
				log.Printf("让对手获得特权指示物成功")
			}
		case "discardGem":
			if gemType, ok := data["gemType"].(string); ok {
				log.Printf("执行丢弃宝石操作，宝石类型: %s", gemType)
				if err := gl.DiscardGem(message.PlayerID, models.GemType(gemType)); err != nil {
					log.Printf("丢弃宝石失败: %v", err)
				} else {
					log.Printf("丢弃宝石成功")
					// 记录丢弃宝石，支持单枚
					pic := histGemImg(gemType)
					html := fmt.Sprintf("丢弃宝石 %s", pic)
					desc := "丢弃宝石"
					broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
				}
			}
		case "discardGemsBatch":
			if gemDiscardsData, ok := data["gemDiscards"].(map[string]interface{}); ok {
				log.Printf("执行批量丢弃宝石操作，丢弃详情: %v", gemDiscardsData)
				gemDiscards := make(map[models.GemType]int)
				for gemTypeStr, count := range gemDiscardsData { if countFloat, ok := count.(float64); ok { gemDiscards[models.GemType(gemTypeStr)] = int(countFloat) } }
				if err := gl.DiscardGemsBatch(message.PlayerID, gemDiscards); err != nil {
					log.Printf("批量丢弃宝石失败: %v", err)
				} else {
					log.Printf("批量丢弃宝石成功")
					// 记录批量丢弃
					var pics []string
					for gt, ct := range gemDiscards {
						for i := 0; i < ct; i++ { pics = append(pics, histGemImg(string(gt))) }
					}
					html := fmt.Sprintf("丢弃宝石 %s", strings.Join(pics, ""))
					desc := "丢弃宝石"
					broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
				}
			}
		case "endTurn":
			log.Printf("执行回合结束操作")
			if err := gl.HandleTurnEnd(); err != nil {
				log.Printf("回合结束处理失败: %v", err)
			} else {
				log.Printf("回合结束处理成功")
			}
		default:
			log.Printf("未知的游戏动作类型: %s", actionType)
		}
		
		log.Printf("游戏状态已更新")
	})

	// 获取最新的游戏状态并广播
	latestRoom := room.Manager.GetRoom(c.RoomID)
	latestGameState := latestRoom.GameState
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &latestGameState,
	})
	
	// 如果游戏已开始，广播游戏开始消息
	if latestGameState.Status == models.GameStatusPlaying {
		room.broadcastToAll(models.WSMessage{
			Type: "game_start",
			Data: latestRoom,
		})
	}
}

// handleStartGame 处理开始游戏
func (c *Client) handleStartGame(room *Room) {
	// 使用游戏逻辑来正确初始化游戏
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		// 创建游戏逻辑实例
		gl := game.NewGameLogic(&roomData.GameState, room.Manager)
		
		// 开始游戏（这会初始化宝石版图、发展卡等）
		if err := gl.StartGame(); err != nil {
			log.Printf("开始游戏失败: %v", err)
			return
		}
		
		roomData.GameState.StartedAt = time.Now()
	})

	// 广播游戏开始消息
	room.broadcastToAll(models.WSMessage{
		Type: "game_start",
		Data: room.Manager.GetRoom(c.RoomID),
	})

	// 广播更新后的游戏状态
	gameState2 := room.Manager.GetRoom(c.RoomID).GameState
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &gameState2,
	})
}

// cleanup 清理客户端
func (c *Client) cleanup() {
	hub := getHub()
	if room, exists := hub.Rooms[c.RoomID]; exists {
		// 在注销客户端之前，广播玩家离开消息
		if c.PlayerID != "" {
			room.broadcastToAll(models.WSMessage{
				Type: "player_left",
				Data: map[string]any{
					"playerId": c.PlayerID,
				},
			})
		}
		
		room.unregisterClient(c)
		
		// 如果没有客户端了，删除房间
		room.mutex.RLock()
		if len(room.Clients) == 0 {
			room.mutex.RUnlock()
			hub.mutex.Lock()
			delete(hub.Rooms, c.RoomID)
			hub.mutex.Unlock()
		} else {
			room.mutex.RUnlock()
		}
	}

	c.Conn.Close()
}

// generateClientID 生成客户端ID
func generateClientID() string {
	return "client_" + time.Now().Format("20060102150405") + "_" + string(rune(time.Now().UnixNano()%1000))
}

// generateActionDescription 生成动作描述
func generateActionDescription(message models.WSMessage) string {
	switch message.Type {
	case "take_gems":
		return "拿取宝石"
	case "buy_card":
		return "购买发展卡"
	case "reserve_card":
		return "保留发展卡"
	case "start_game":
		return "开始游戏"
	default:
		return "执行动作"
	}
}
