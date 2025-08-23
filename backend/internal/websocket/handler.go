package websocket

import (
	"encoding/json"
	"log"
	"net/http"
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
	// 广播玩家加入消息
	room.broadcastToAll(models.WSMessage{
		Type: "player_joined",
		Data: map[string]interface{}{
			"playerId":   message.PlayerID,
			"playerName": message.PlayerName,
		},
	})

	// 更新游戏状态并检查是否应该开始游戏
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		for i, player := range roomData.GameState.Players {
			if player.ID == message.PlayerID {
				roomData.GameState.Players[i].LastActive = time.Now()
				break
			}
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

	// 广播更新后的游戏状态
	gameState := room.Manager.GetRoom(c.RoomID).GameState
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &gameState,
	})
	
	// 如果游戏已开始，广播游戏开始消息
	if gameState.Status == models.GameStatusPlaying {
		room.broadcastToAll(models.WSMessage{
			Type: "game_start",
			Data: room.Manager.GetRoom(c.RoomID),
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

	// 广播聊天消息
	room.broadcastToAll(models.WSMessage{
		Type:    "chat_message",
		Message: chatMessage.Message,
	})
}

// handleGameAction 处理游戏动作
func (c *Client) handleGameAction(message models.WSMessage, room *Room) {
	log.Printf("处理游戏动作: %s, 玩家: %s, 数据: %+v", message.Type, message.PlayerName, message.Data)
	
	gameAction := models.GameAction{
		ID:          generateClientID(),
		PlayerID:    message.PlayerID,
		PlayerName:  message.PlayerName,
		Type:        message.Type,
		Data:        message.Data.(map[string]interface{}),
		Timestamp:   time.Now(),
		Description: generateActionDescription(message),
	}

	// 广播游戏动作
	room.broadcastToAll(models.WSMessage{
		Type:   "game_action",
		Action: &gameAction,
	})

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
		case "takeGems":
			if gemPositions, ok := message.Data.(map[string]interface{})["gemPositions"].([]interface{}); ok {
				log.Printf("执行拿取宝石操作，位置: %+v", gemPositions)
				// 转换类型以匹配TakeGems函数的参数
				var positions []map[string]interface{}
				for _, pos := range gemPositions {
					if posMap, ok := pos.(map[string]interface{}); ok {
						positions = append(positions, posMap)
					}
				}
				if err := gl.TakeGems(message.PlayerID, positions); err != nil {
					log.Printf("拿取宝石失败: %v", err)
				} else {
					log.Printf("拿取宝石成功")
				}
			}
		case "buyCard":
			if cardID, ok := message.Data.(map[string]interface{})["cardId"].(string); ok {
				log.Printf("执行购买发展卡操作，卡牌ID: %s", cardID)
				if err := gl.BuyCard(message.PlayerID, cardID); err != nil {
					log.Printf("购买发展卡失败: %v", err)
				} else {
					log.Printf("购买发展卡成功")
				}
			}
		case "reserveCard":
			if cardID, ok := message.Data.(map[string]interface{})["cardId"].(string); ok {
				log.Printf("执行保留发展卡操作，卡牌ID: %s", cardID)
				// 获取黄金位置
				var goldX, goldY int
				if goldXVal, ok := message.Data.(map[string]interface{})["goldX"].(float64); ok {
					goldX = int(goldXVal)
				}
				if goldYVal, ok := message.Data.(map[string]interface{})["goldY"].(float64); ok {
					goldY = int(goldYVal)
				}
				if err := gl.ReserveCard(message.PlayerID, cardID, goldX, goldY); err != nil {
					log.Printf("保留发展卡失败: %v", err)
				} else {
					log.Printf("保留发展卡成功")
				}
			}
		case "spendPrivilege":
			if privilegeCount, ok := message.Data.(map[string]interface{})["privilegeCount"].(float64); ok {
				log.Printf("执行花费特权操作，特权数量: %f", privilegeCount)
				// 获取宝石位置
				if gemPositions, ok := message.Data.(map[string]interface{})["gemPositions"].([]interface{}); ok {
					var positions []map[string]interface{}
					for _, pos := range gemPositions {
						if posMap, ok := pos.(map[string]interface{}); ok {
							positions = append(positions, posMap)
						}
					}
					if err := gl.SpendPrivilege(message.PlayerID, int(privilegeCount), positions); err != nil {
						log.Printf("花费特权失败: %v", err)
					} else {
						log.Printf("花费特权成功")
					}
				}
			}
		case "refillBoard":
			log.Printf("执行补充版图操作")
			if err := gl.RefillBoard(message.PlayerID); err != nil {
				log.Printf("补充版图失败: %v", err)
			} else {
				log.Printf("补充版图成功")
			}
		default:
			log.Printf("未知的游戏动作类型: %s", message.Type)
		}
		
		// 更新游戏状态
		log.Printf("游戏状态已更新")
	})

	// 广播更新后的游戏状态
	gameState := room.Manager.GetRoom(c.RoomID).GameState
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &gameState,
	})
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
