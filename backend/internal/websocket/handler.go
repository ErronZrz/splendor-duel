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

	// 更新游戏状态
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		if player, exists := roomData.GameState.Players[message.PlayerID]; exists {
			player.LastActive = time.Now()
			roomData.GameState.Players[message.PlayerID] = player
		}
	})

	// 广播更新后的游戏状态
	gameState := room.Manager.GetRoom(c.RoomID).GameState
	room.broadcastToAll(models.WSMessage{
		Type:      "game_state_update",
		GameState: &gameState,
	})
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

	// 这里可以添加游戏逻辑处理
	// 例如：移动棋子、购买卡片等
}

// handleStartGame 处理开始游戏
func (c *Client) handleStartGame(room *Room) {
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		roomData.GameState.Status = "playing"
		roomData.GameState.StartedAt = time.Now()
		
		// 设置第一个玩家为当前回合
		for playerID := range roomData.GameState.Players {
			roomData.GameState.CurrentTurn = playerID
			break
		}
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
