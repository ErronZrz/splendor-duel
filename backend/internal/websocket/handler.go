package websocket

import (
	"bytes"
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
	"splendor-duel-backend/internal/security"

	"github.com/gorilla/websocket"
)

type boardPositionPayload struct {
	X *int `json:"x"`
	Y *int `json:"y"`
}

type takeGemsPayload struct {
	GemPositions []boardPositionPayload `json:"gemPositions"`
}

type reserveCardPayload struct {
	CardID string `json:"cardId"`
	GoldX  *int   `json:"goldX"`
	GoldY  *int   `json:"goldY"`
}

type spendPrivilegePayload struct {
	PrivilegeCount *int                   `json:"privilegeCount"`
	GemPositions   []boardPositionPayload `json:"gemPositions"`
}

type discardGemPayload struct {
	GemType string `json:"gemType"`
}

type discardGemsBatchPayload struct {
	GemDiscards map[string]int `json:"gemDiscards"`
}

type purchaseExtraTokenPayload struct {
	SelectedGem *boardPositionPayload `json:"selectedGem,omitempty"`
	Skipped     bool                  `json:"skipped,omitempty"`
}

type purchaseStealPayload struct {
	GemType string `json:"gemType,omitempty"`
	Skipped bool   `json:"skipped,omitempty"`
}

type purchaseWildcardPayload struct {
	Color string `json:"color,omitempty"`
}

type purchaseNoblePayload struct {
	ID string `json:"id,omitempty"`
}

type purchaseEffectsPayload struct {
	ExtraToken *purchaseExtraTokenPayload `json:"extraToken,omitempty"`
	Steal      *purchaseStealPayload      `json:"steal,omitempty"`
	Wildcard   *purchaseWildcardPayload   `json:"wildcard,omitempty"`
	Noble      *purchaseNoblePayload      `json:"noble,omitempty"`
}

type buyCardPayload struct {
	CardID      string                  `json:"cardId"`
	PaymentPlan map[string]int          `json:"paymentPlan"`
	Effects     *purchaseEffectsPayload `json:"effects,omitempty"`
}

func decodeActionPayload(data any, target any) error {
	raw, err := json.Marshal(data)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return nil
}

func domainPosition(position boardPositionPayload) (models.BoardPosition, bool) {
	if position.X == nil || position.Y == nil {
		return models.BoardPosition{}, false
	}
	return models.BoardPosition{X: *position.X, Y: *position.Y}, true
}

func domainPurchase(payload buyCardPayload) models.PurchaseSelection {
	purchase := models.PurchaseSelection{CardID: payload.CardID, PaymentPlan: models.PaymentPlan{}}
	for gemType, count := range payload.PaymentPlan {
		purchase.PaymentPlan[models.GemType(gemType)] = count
	}
	if payload.Effects == nil {
		return purchase
	}
	effects := &models.PurchaseEffects{}
	if extra := payload.Effects.ExtraToken; extra != nil {
		domainExtra := &models.PurchaseExtraToken{Skipped: extra.Skipped}
		if extra.SelectedGem != nil {
			if position, ok := domainPosition(*extra.SelectedGem); ok {
				domainExtra.SelectedGem = &position
			}
		}
		effects.ExtraToken = domainExtra
	}
	if steal := payload.Effects.Steal; steal != nil {
		effects.Steal = &models.PurchaseSteal{GemType: models.GemType(steal.GemType), Skipped: steal.Skipped}
	}
	if wildcard := payload.Effects.Wildcard; wildcard != nil {
		effects.Wildcard = &models.PurchaseWildcard{Color: models.GemType(wildcard.Color)}
	}
	if noble := payload.Effects.Noble; noble != nil {
		effects.Noble = &models.PurchaseNoble{ID: noble.ID}
	}
	purchase.Effects = effects
	return purchase
}

// Client WebSocket 客户端
type Client struct {
	ID          string
	RoomID      string
	PlayerID    string
	PlayerName  string
	Conn        *websocket.Conn
	Send        chan []byte
	Manager     *game.Manager
	cleanupOnce sync.Once
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
func HandleWebSocket(w http.ResponseWriter, r *http.Request, roomID string, gameManager *game.Manager, originPolicy security.OriginPolicy) {
	upgrader := newUpgrader(originPolicy)
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed")
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

	// 获取或创建房间，并与最后一个客户端离开时的房间删除原子协调。
	hub := getHub()
	hub.registerClient(roomID, gameManager, client)

	// 启动客户端协程
	go client.writePump()
	go client.readPump()
}

func newUpgrader(originPolicy security.OriginPolicy) websocket.Upgrader {
	return websocket.Upgrader{CheckOrigin: originPolicy.Allows}
}

// 全局 Hub 实例
var globalHub *Hub

func init() {
	globalHub = NewHub()
}

func getHub() *Hub {
	return globalHub
}

// registerClient 获取或创建房间并注册客户端。锁顺序固定为 Hub -> Room。
// 房间信息与历史必须等 player_join 身份校验通过后才发送。
func (h *Hub) registerClient(roomID string, gameManager *game.Manager, client *Client) *Room {
	h.mutex.Lock()
	room, exists := h.Rooms[roomID]
	if !exists {
		room = &Room{
			ID:      roomID,
			Clients: make(map[*Client]bool),
			Manager: gameManager,
		}
		h.Rooms[roomID] = room
	}
	room.mutex.Lock()
	room.Clients[client] = true
	room.mutex.Unlock()
	h.mutex.Unlock()
	log.Printf("WebSocket client connected")
	return room
}

// authenticateAndQueueInitial atomically marks a validated client as eligible
// for broadcasts after room metadata and retained history are queued. History
// append+broadcast uses the same Room lock, so a reconnect receives each entry
// either in the snapshot or as a later live event, never neither.
func (r *Room) authenticateAndQueueInitial(client *Client, playerID, playerName string, roomInfo *models.Room) bool {
	roomInfoMessage, err := json.Marshal(models.WSMessage{Type: "room_info", Data: roomInfo})
	if err != nil {
		log.Printf("WebSocket room-info serialization failed")
		return false
	}

	r.mutex.Lock()
	defer r.mutex.Unlock()
	if !r.Clients[client] {
		return false
	}

	messages := [][]byte{roomInfoMessage}
	if len(r.ChatMessages) > 0 || len(r.GameHistory) > 0 {
		historySnapshot, marshalErr := json.Marshal(models.WSMessage{
			Type: "history_snapshot",
			Data: map[string]any{
				"chat":    r.ChatMessages,
				"history": r.GameHistory,
			},
		})
		if marshalErr != nil {
			log.Printf("WebSocket history serialization failed")
			return false
		}
		messages = append(messages, historySnapshot)
	}
	if cap(client.Send)-len(client.Send) < len(messages) {
		return false
	}
	for _, message := range messages {
		client.Send <- message
	}
	client.PlayerID = playerID
	client.PlayerName = playerName
	return true
}

func (h *Hub) getRoom(roomID string) *Room {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return h.Rooms[roomID]
}

// unregisterClient 注销客户端，并在最后一个客户端离开时删除 Hub 房间。
// 删除和注册使用相同的 Hub -> Room 锁顺序，避免新连接注册到已移除的房间对象。
func (h *Hub) unregisterClient(client *Client) bool {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	room, exists := h.Rooms[client.RoomID]
	if !exists {
		return false
	}
	room.mutex.Lock()
	defer room.mutex.Unlock()
	if _, registered := room.Clients[client]; !registered {
		return false
	}
	delete(room.Clients, client)
	close(client.Send)
	log.Printf("WebSocket client disconnected")
	// A room with replayable history outlives temporary zero-client gaps (for
	// example a page refresh). Empty rooms can still be released immediately.
	if len(room.Clients) == 0 && len(room.ChatMessages) == 0 && len(room.GameHistory) == 0 {
		delete(h.Rooms, client.RoomID)
	}
	return true
}

// CleanupOrphanedRooms releases retained history after the corresponding
// authoritative Manager room has expired. It is called after Manager cleanup.
func CleanupOrphanedRooms() {
	hub := getHub()
	hub.mutex.RLock()
	type candidate struct {
		id      string
		room    *Room
		manager *game.Manager
	}
	candidates := make([]candidate, 0, len(hub.Rooms))
	for id, room := range hub.Rooms {
		candidates = append(candidates, candidate{id: id, room: room, manager: room.Manager})
	}
	hub.mutex.RUnlock()

	for _, item := range candidates {
		if item.manager != nil && item.manager.GetRoom(item.id) != nil {
			continue
		}
		hub.mutex.Lock()
		current := hub.Rooms[item.id]
		if current == item.room {
			current.mutex.Lock()
			current.ChatMessages = nil
			current.GameHistory = nil
			if len(current.Clients) == 0 {
				delete(hub.Rooms, item.id)
			}
			current.mutex.Unlock()
		}
		hub.mutex.Unlock()
	}
}

// broadcastToClient 向特定客户端广播消息
func (r *Room) broadcastToClient(client *Client, message models.WSMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("WebSocket message serialization failed")
		return
	}

	r.mutex.RLock()
	_, registered := r.Clients[client]
	slow := false
	if registered {
		select {
		case client.Send <- data:
		default:
			slow = true
		}
	}
	r.mutex.RUnlock()
	if slow {
		getHub().unregisterClient(client)
		if client.Conn != nil {
			client.Conn.Close()
		}
	}
}

// broadcastToAll 向所有客户端广播消息
func (r *Room) broadcastToAll(message models.WSMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("WebSocket message serialization failed")
		return
	}

	var slowClients []*Client
	r.mutex.RLock()
	for client := range r.Clients {
		if client.PlayerID == "" {
			continue
		}
		select {
		case client.Send <- data:
		default:
			slowClients = append(slowClients, client)
		}
	}
	r.mutex.RUnlock()
	for _, client := range slowClients {
		getHub().unregisterClient(client)
		if client.Conn != nil {
			client.Conn.Close()
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
				log.Printf("WebSocket read failed")
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
		log.Printf("WebSocket message rejected: invalid JSON")
		c.sendError("消息格式无效")
		return
	}

	// 获取房间
	hub := getHub()
	room := hub.getRoom(c.RoomID)
	if room == nil {
		c.sendError("房间不存在")
		return
	}

	if wsMessage.Type != "player_join" {
		if c.PlayerID == "" {
			room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "请先加入房间"})
			return
		}
		if wsMessage.PlayerID != c.PlayerID {
			room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "玩家身份与当前连接不匹配"})
			return
		}
		wsMessage.PlayerName = c.PlayerName
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
		log.Printf("WebSocket message rejected: unknown type")
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "未知消息类型"})
	}
}

func (c *Client) sendError(message string) {
	if room := getHub().getRoom(c.RoomID); room != nil {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: message})
	}
}

// handlePlayerJoin 处理玩家加入
func (c *Client) handlePlayerJoin(message models.WSMessage, room *Room) {
	if message.PlayerID == "" || message.PlayerName == "" {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "玩家身份无效"})
		return
	}
	if c.PlayerID != "" && c.PlayerID != message.PlayerID {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "当前连接已绑定其他玩家"})
		return
	}

	roomData := room.Manager.GetRoom(c.RoomID)
	if roomData == nil {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "房间不存在"})
		return
	}
	playerFound := false
	for _, player := range roomData.GameState.Players {
		if player.ID == message.PlayerID && player.Name == message.PlayerName {
			playerFound = true
			break
		}
	}
	if !playerFound {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "玩家不属于该房间"})
		return
	}

	// 更新游戏状态并检查是否应该开始游戏
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		// 玩家已由创建/加入房间 HTTP 入口创建，WebSocket 只更新活跃时间。
		for i, player := range roomData.GameState.Players {
			if player.ID == message.PlayerID {
				roomData.GameState.Players[i].LastActive = time.Now()
				break
			}
		}

		// 检查是否应该自动开始游戏（当有2个玩家且状态为waiting时）
		if len(roomData.GameState.Players) >= 2 && roomData.GameState.Status == models.GameStatusWaiting {
			log.Printf("WebSocket automatic game start")

			// 创建游戏逻辑实例并开始游戏
			gl := game.NewGameLogic(&roomData.GameState, room.Manager)
			if err := gl.StartGame(); err != nil {
				log.Printf("WebSocket automatic game start failed")
				return
			}

			roomData.GameState.StartedAt = time.Now()
			log.Printf("游戏已自动开始")
		}
	})

	// 获取最新的游戏状态
	latestRoom := room.Manager.GetRoom(c.RoomID)
	if latestRoom == nil {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "房间不存在"})
		return
	}
	if !room.authenticateAndQueueInitial(c, message.PlayerID, message.PlayerName, latestRoom) {
		log.Printf("WebSocket client rejected: initial queue unavailable")
		getHub().unregisterClient(c)
		if c.Conn != nil {
			c.Conn.Close()
		}
		return
	}
	latestGameState := latestRoom.GameState

	// 初始快照入队并完成身份绑定后，才允许该客户端接收房间广播。
	room.broadcastToAll(models.WSMessage{
		Type: "player_joined",
		Data: map[string]any{
			"playerId":   message.PlayerID,
			"playerName": message.PlayerName,
		},
	})

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
	if !models.ValidChatMessage(message.Message) {
		c.sendError("聊天消息长度无效")
		return
	}
	chatMessage := models.ChatMessage{
		ID:         generateClientID(),
		PlayerID:   message.PlayerID,
		PlayerName: message.PlayerName,
		Message:    message.Message,
		Timestamp:  time.Now(),
	}

	// 保存与广播共享 Room 锁，确保重连快照和实时事件无缺口、无重复。
	room.appendChatAndBroadcast(chatMessage, models.WSMessage{
		Type:       "chat_message",
		PlayerID:   chatMessage.PlayerID,
		PlayerName: chatMessage.PlayerName,
		Message:    chatMessage.Message,
	})
}

func (r *Room) appendChatAndBroadcast(chatMessage models.ChatMessage, message models.WSMessage) {
	r.appendReplayEvent(message, func() {
		r.ChatMessages = append(r.ChatMessages, chatMessage)
	})
}

func histGemImg(g string) string {
	if g == "" {
		return ""
	}
	return fmt.Sprintf(`<img class="hist-gem" src="/images/gems/%s.jpg" alt="%s" />`, g, g)
}
func histCardLink(id string) string {
	if id == "" {
		return "发展卡"
	}
	// 使用 span + data-preview 实现悬停预览，不提供跳转
	return fmt.Sprintf(`<span class="hist-link" data-preview="/images/cards/%s.jpg">发展卡</span>`, id)
}
func histNobleLink(id string) string {
	if id == "" {
		return "贵族"
	}
	// 使用 span + data-preview 实现悬停预览，不提供跳转
	return fmt.Sprintf(`<span class="hist-link" data-preview="/images/nobles/%s.jpg">贵族</span>`, id)
}

func parseTypedBoardPosition(position boardPositionPayload, board [][]models.GemType) (int, int, bool) {
	if position.X == nil || position.Y == nil || *position.X < 0 || *position.Y < 0 {
		return 0, 0, false
	}
	row, col := *position.X, *position.Y
	if row >= len(board) || col >= len(board[row]) {
		return 0, 0, false
	}
	return row, col, true
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

	// 保存与广播共享 Room 锁，确保重连快照和实时事件无缺口、无重复。
	room.appendReplayEvent(models.WSMessage{Type: "game_action", Action: &ga}, func() {
		room.GameHistory = append(room.GameHistory, ga)
	})
}

func (r *Room) appendReplayEvent(message models.WSMessage, appendEntry func()) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("WebSocket replay serialization failed")
		return
	}

	var slowClients []*Client
	r.mutex.Lock()
	appendEntry()
	for client := range r.Clients {
		if client.PlayerID == "" {
			continue
		}
		select {
		case client.Send <- data:
		default:
			slowClients = append(slowClients, client)
		}
	}
	r.mutex.Unlock()
	for _, client := range slowClients {
		getHub().unregisterClient(client)
		if client.Conn != nil {
			client.Conn.Close()
		}
	}
}

func sendActionResult(room *Room, client *Client, result models.ActionResult) {
	room.broadcastToClient(client, models.WSMessage{Type: "action_result", Data: result})
}

func broadcastAuthoritativeState(room *Room, latestRoom *models.Room) {
	latestGameState := latestRoom.GameState
	room.broadcastToAll(models.WSMessage{Type: "game_state_update", GameState: &latestGameState})
	if latestGameState.Status == models.GameStatusPlaying {
		room.broadcastToAll(models.WSMessage{Type: "game_start", Data: latestRoom})
	}
}

const maxActionReceiptsPerRoom = 4096

func validRequestID(requestID string) bool {
	if requestID == "" {
		return true
	}
	if len(requestID) > 128 {
		return false
	}
	for _, char := range requestID {
		if (char < 'a' || char > 'z') && (char < 'A' || char > 'Z') && (char < '0' || char > '9') && char != '-' && char != '_' && char != '.' && char != ':' {
			return false
		}
	}
	return true
}

func actionReceiptKey(playerID, requestID string) string {
	return playerID + "\x00" + requestID
}

// handleGameAction 处理游戏动作
func (c *Client) handleGameAction(message models.WSMessage, room *Room) {
	log.Printf("WebSocket game action received")
	if !validRequestID(message.RequestID) {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "requestId 无效"})
		return
	}
	result := models.ActionResult{RequestID: message.RequestID, ActionType: message.ActionType, Success: true}
	duplicate := false

	// 执行游戏逻辑
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		var receiptKey string
		if message.RequestID != "" {
			receiptKey = actionReceiptKey(message.PlayerID, message.RequestID)
			if cached, exists := roomData.ActionReceipts[receiptKey]; exists {
				if cached.ActionType != message.ActionType {
					result.Success = false
					result.Message = "requestId 已用于其他动作"
				} else {
					result = cached
					result.Replayed = true
				}
				duplicate = true
				return
			}
			if roomData.ActionReceipts == nil {
				roomData.ActionReceipts = make(map[string]models.ActionResult)
			}
			if len(roomData.ActionReceipts) >= maxActionReceiptsPerRoom {
				result.Success = false
				result.Message = "房间动作请求记录已满"
				duplicate = true
				return
			}
			defer func() { roomData.ActionReceipts[receiptKey] = result }()
		}
		fail := func(messageText string) {
			result.Success = false
			result.Message = messageText
			if message.RequestID == "" {
				room.broadcastToClient(c, models.WSMessage{Type: "error", Message: messageText})
			}
		}
		if message.Data == nil {
			fail("游戏动作数据无效")
			return
		}
		if message.ActionType == "" {
			fail("游戏动作类型无效")
			return
		}
		// 创建游戏逻辑实例
		gl := game.NewGameLogic(&roomData.GameState, room.Manager)

		// 根据动作类型执行相应的游戏逻辑
		// 前端发送的actionType在消息的顶层，data在消息的data字段中
		actionType := message.ActionType

		log.Printf("WebSocket game action processing")

		switch actionType {
		case "start_game":
			var payload struct{}
			if err := decodeActionPayload(message.Data, &payload); err != nil {
				fail("无效的开始游戏数据")
				return
			}
			log.Printf("执行开始游戏操作")
			if roomData.GameState.Status == models.GameStatusPlaying {
				log.Printf("游戏已经开始，拒绝重复开始操作")
				fail("游戏已经开始")
				return
			}
			if len(roomData.GameState.Players) >= 2 {
				if err := gl.StartGame(); err != nil {
					log.Printf("WebSocket action failed")
					fail(err.Error())
					return
				}
				roomData.GameState.StartedAt = time.Now()
				log.Printf("游戏已手动开始")
			} else {
				log.Printf("玩家数量不足，无法开始游戏")
				fail("玩家数量不足，无法开始游戏")
				return
			}
		case "takeGems":
			var payload takeGemsPayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.GemPositions == nil {
				fail("无效的宝石位置")
				return
			}
			log.Printf("WebSocket action: takeGems")
			positions := make([]models.BoardPosition, 0, len(payload.GemPositions))
			for _, position := range payload.GemPositions {
				domain, ok := domainPosition(position)
				if !ok {
					fail("无效的宝石位置")
					return
				}
				positions = append(positions, domain)
			}
			// 预生成图片与类型（使用操作前的版图）
			var pics []string
			var types []string
			for _, position := range payload.GemPositions {
				x, y, valid := parseTypedBoardPosition(position, roomData.GameState.GemBoard)
				if !valid {
					fail("无效的宝石位置")
					return
				}
				g := string(roomData.GameState.GemBoard[x][y])
				types = append(types, g)
				pics = append(pics, histGemImg(g))
			}
			if err := gl.TakeGems(message.PlayerID, positions); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				// 检查是否触发让对手获得特权条件：3同色（非gold）或包含2枚珍珠
				grant := false
				if len(types) == 3 {
					same := (types[0] == types[1] && types[1] == types[2] && types[0] != "gold")
					grant = grant || same
				}
				pearl := 0
				for _, t := range types {
					if t == "pearl" {
						pearl++
					}
				}
				if pearl >= 2 {
					grant = true
				}
				html := fmt.Sprintf("拿取宝石：%s", strings.Join(pics, ""))
				if grant {
					html += "，允许对手获取一个特权指示物"
				}
				desc := "拿取宝石"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
			}

		case "buyCard":
			var payload buyCardPayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.CardID == "" {
				fail("无效的购买卡牌数据")
				return
			}
			purchase := domainPurchase(payload)
			cardID := payload.CardID
			log.Printf("WebSocket action: buyCard")
			// 预处理：支付、特效与来源
			// 查找当前玩家索引
			idx := -1
			for i, p := range roomData.GameState.Players {
				if p.ID == message.PlayerID {
					idx = i
					break
				}
			}
			if idx < 0 {
				idx = 0
			}
			before := roomData.GameState.Players[idx]
			wasReserved := false
			for _, rc := range before.ReservedCards {
				if rc == cardID {
					wasReserved = true
					break
				}
			}
			// 预取特效信息
			var extraPic string
			if payload.Effects != nil && payload.Effects.ExtraToken != nil && payload.Effects.ExtraToken.SelectedGem != nil {
				if x, y, valid := parseTypedBoardPosition(*payload.Effects.ExtraToken.SelectedGem, roomData.GameState.GemBoard); valid {
					extraPic = histGemImg(string(roomData.GameState.GemBoard[x][y]))
				}
			}
			stealGem := ""
			if payload.Effects != nil && payload.Effects.Steal != nil {
				stealGem = payload.Effects.Steal.GemType
			}
			wildColor := ""
			if payload.Effects != nil && payload.Effects.Wildcard != nil {
				wildColor = payload.Effects.Wildcard.Color
			}
			nobleId := ""
			if payload.Effects != nil && payload.Effects.Noble != nil {
				nobleId = payload.Effects.Noble.ID
			}
			// 执行购买
			if err := gl.BuyCardWithPaymentPlanAndEffects(message.PlayerID, purchase); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				// 组装购买历史
				var pics []string
				totalPay := 0
				for k, c := range payload.PaymentPlan {
					totalPay += c
					for i := 0; i < c; i++ {
						pics = append(pics, histGemImg(k))
					}
				}
				cd := roomData.GameState.CardDetails[cardID]
				level := int(cd.Level)
				var html, desc string
				if totalPay <= 0 {
					html = fmt.Sprintf("免费拿取一张等级 %d 的%s", level, histCardLink(cardID))
					desc = "免费拿取发展卡"
				} else {
					source := "购买一张"
					if wasReserved {
						source = "从保留的发展卡购买一张"
					}
					html = fmt.Sprintf("花费 %s，%s等级 %d 的%s", strings.Join(pics, ""), source, level, histCardLink(cardID))
					desc = "购买发展卡"
				}
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
				// 获得贵族
				if nobleId != "" {
					// 判定是第3还是第6皇冠（根据已有贵族数量）
					owned := len(before.Nobles)
					threshold := 3
					if owned >= 1 {
						threshold = 6
					}
					broadcastHistory(room, message.PlayerID, message.PlayerName, "获得贵族", fmt.Sprintf("因皇冠数达到 %d 获得%s", threshold, histNobleLink(nobleId)))
				}
				// 特殊效果历史
				// 额外token
				if extraPic != "" {
					broadcastHistory(room, message.PlayerID, message.PlayerName, "额外token", fmt.Sprintf("因发展卡效果，拿取额外的 %s", extraPic))
				}
				// 窃取
				if stealGem != "" {
					src := "发展卡效果"
					if nobleId == "noble1" {
						src = "贵族效果"
					}
					broadcastHistory(room, message.PlayerID, message.PlayerName, "窃取", fmt.Sprintf("因%s，从对手处拿取一枚 %s", src, histGemImg(stealGem)))
				}
				// 百搭颜色
				if wildColor != "" {
					cn := map[string]string{"white": "白色", "blue": "蓝色", "green": "绿色", "red": "红色", "black": "黑色"}[wildColor]
					broadcastHistory(room, message.PlayerID, message.PlayerName, "百搭颜色", fmt.Sprintf("将百搭颜色卡放置在%s组中", cn))
				}
				// 新的回合/获取特权
				// 依据卡效果或贵族
				effArr := cd.Effects
				for _, e := range effArr {
					if e == models.NewTurn {
						broadcastHistory(room, message.PlayerID, message.PlayerName, "新的回合", "因发展卡效果，获得额外的回合")
					}
					if e == models.GetPrivilege {
						broadcastHistory(room, message.PlayerID, message.PlayerName, "获得特权", "因发展卡效果，获得一个特权指示物")
					}
				}
				if nobleId == "noble2" {
					broadcastHistory(room, message.PlayerID, message.PlayerName, "新的回合", "因贵族效果，获得额外的回合")
				}
				if nobleId == "noble3" {
					broadcastHistory(room, message.PlayerID, message.PlayerName, "获得特权", "因贵族效果，获得一个特权指示物")
				}
			}
		case "reserveCard":
			var payload reserveCardPayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.CardID == "" || payload.GoldX == nil || payload.GoldY == nil {
				fail("无效的保留卡数据")
				return
			}
			{
				cardID := payload.CardID
				log.Printf("WebSocket action: reserveCard")
				goldRow, goldCol := *payload.GoldX, *payload.GoldY
				// 执行前后比较找出真实卡ID
				// 查找当前玩家索引
				idx := -1
				for i, p := range roomData.GameState.Players {
					if p.ID == message.PlayerID {
						idx = i
						break
					}
				}
				if idx < 0 {
					idx = 0
				}
				before := roomData.GameState.Players[idx].ReservedCards
				if err := gl.ReserveCard(message.PlayerID, models.ReserveSelection{CardID: cardID, GoldPosition: models.BoardPosition{X: goldRow, Y: goldCol}}); err != nil {
					log.Printf("WebSocket action failed")
					fail(err.Error())
				} else {
					after := roomData.GameState.Players[idx].ReservedCards
					actual := ""
					m := map[string]bool{}
					for _, id := range before {
						m[id] = true
					}
					for _, id := range after {
						if !m[id] {
							actual = id
							break
						}
					}
					if actual == "" && len(after) > 0 {
						actual = after[len(after)-1]
					}
					// 区分来源：若 cardID 形如 deck_level_X，则为从牌堆保留，隐藏具体卡信息
					if strings.HasPrefix(cardID, "deck_level_") {
						lvlStr := strings.TrimPrefix(cardID, "deck_level_")
						level := 0
						if v, err := strconv.Atoi(lvlStr); err == nil {
							level = v
						}
						html := fmt.Sprintf("从牌堆保留一张等级 %d 的发展卡，并获得 1 枚黄金", level)
						desc := "保留发展卡并获得黄金"
						broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					} else {
						level := 0
						if cd, ok := roomData.GameState.CardDetails[actual]; ok {
							level = int(cd.Level)
						}
						html := fmt.Sprintf("保留一张等级 %d 的%s，并获得 1 枚黄金", level, histCardLink(actual))
						desc := "保留发展卡并获得黄金"
						broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
					}
				}
			}
		case "spendPrivilege":
			var payload spendPrivilegePayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.PrivilegeCount == nil || payload.GemPositions == nil {
				fail("无效的特权操作数据")
				return
			}
			privilegeCount := *payload.PrivilegeCount
			log.Printf("WebSocket action: spendPrivilege")
			positions := make([]models.BoardPosition, 0, len(payload.GemPositions))
			inner := make([]string, 0, len(payload.GemPositions))
			for _, position := range payload.GemPositions {
				pos, validPosition := domainPosition(position)
				if !validPosition {
					fail("无效的宝石位置")
					return
				}
				x, y, ok := parseTypedBoardPosition(position, roomData.GameState.GemBoard)
				if !ok {
					fail("无效的宝石位置")
					return
				}
				positions = append(positions, pos)
				inner = append(inner, histGemImg(string(roomData.GameState.GemBoard[x][y])))
			}
			if err := gl.SpendPrivilege(message.PlayerID, privilegeCount, positions); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				pics := strings.Join(inner, "")
				html := fmt.Sprintf("花费了 %d 特权指示物，拿取 %s", privilegeCount, pics)
				desc := "花费特权"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
			}
		case "refillBoard":
			var payload struct{}
			if err := decodeActionPayload(message.Data, &payload); err != nil {
				fail("无效的补充版图数据")
				return
			}
			log.Printf("执行补充版图操作")
			if err := gl.RefillBoard(message.PlayerID); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				log.Printf("补充版图成功")
				desc := "执行了补充版图，允许对手获取一个特权指示物"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, desc)
			}
		case "grantOpponentPrivilege":
			var payload struct{}
			if err := decodeActionPayload(message.Data, &payload); err != nil {
				fail("无效的特权授予数据")
				return
			}
			log.Printf("执行让对手获得特权指示物操作")
			if err := gl.GrantOpponentPrivilege(message.PlayerID); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				log.Printf("让对手获得特权指示物成功")
			}
		case "discardGem":
			var payload discardGemPayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.GemType == "" {
				fail("无效的丢弃宝石数据")
				return
			}
			gemType := payload.GemType
			log.Printf("WebSocket action: discardGem")
			if err := gl.DiscardGem(message.PlayerID, models.GemType(gemType)); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				log.Printf("丢弃宝石成功")
				// 记录丢弃宝石，支持单枚
				pic := histGemImg(gemType)
				html := fmt.Sprintf("丢弃宝石 %s", pic)
				desc := "丢弃宝石"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
			}
		case "discardGemsBatch":
			var payload discardGemsBatchPayload
			if err := decodeActionPayload(message.Data, &payload); err != nil || payload.GemDiscards == nil {
				fail("无效的丢弃宝石数据")
				return
			}
			log.Printf("WebSocket action: discardGemsBatch")
			gemDiscards := make(map[models.GemType]int, len(payload.GemDiscards))
			for gemType, count := range payload.GemDiscards {
				gemDiscards[models.GemType(gemType)] = count
			}
			if err := gl.DiscardGemsBatch(message.PlayerID, gemDiscards); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				log.Printf("批量丢弃宝石成功")
				// 记录批量丢弃
				var pics []string
				for gt, ct := range gemDiscards {
					for i := 0; i < ct; i++ {
						pics = append(pics, histGemImg(string(gt)))
					}
				}
				html := fmt.Sprintf("丢弃宝石 %s", strings.Join(pics, ""))
				desc := "丢弃宝石"
				broadcastHistory(room, message.PlayerID, message.PlayerName, desc, html)
			}
		case "endTurn":
			var payload struct{}
			if err := decodeActionPayload(message.Data, &payload); err != nil {
				fail("无效的回合结束数据")
				return
			}
			log.Printf("执行回合结束操作")
			if err := gl.HandleTurnEnd(); err != nil {
				log.Printf("WebSocket action failed")
				fail(err.Error())
			} else {
				log.Printf("回合结束处理成功")
			}
		default:
			log.Printf("WebSocket action rejected: unknown type")
			fail("未知的游戏动作类型")
		}

		log.Printf("游戏状态已更新")
	})
	if duplicate {
		sendActionResult(room, c, result)
		return
	}

	// 获取最新的游戏状态并广播
	latestRoom := room.Manager.GetRoom(c.RoomID)
	broadcastAuthoritativeState(room, latestRoom)
	if message.RequestID != "" {
		sendActionResult(room, c, result)
	}
}

// handleStartGame 处理开始游戏
func (c *Client) handleStartGame(room *Room) {
	roomData := room.Manager.GetRoom(c.RoomID)
	if roomData == nil {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "房间不存在"})
		return
	}
	if len(roomData.GameState.Players) < 2 {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: "玩家数量不足，无法开始游戏"})
		return
	}
	var startErr error
	// 使用游戏逻辑来正确初始化游戏
	room.Manager.UpdateRoom(c.RoomID, func(roomData *models.Room) {
		// 创建游戏逻辑实例
		gl := game.NewGameLogic(&roomData.GameState, room.Manager)

		// 开始游戏（这会初始化宝石版图、发展卡等）
		if err := gl.StartGame(); err != nil {
			log.Printf("WebSocket start game failed")
			startErr = err
			return
		}

		roomData.GameState.StartedAt = time.Now()
	})
	if startErr != nil {
		room.broadcastToClient(c, models.WSMessage{Type: "error", Message: startErr.Error()})
		return
	}

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
	c.cleanupOnce.Do(func() {
		hub := getHub()
		if room := hub.getRoom(c.RoomID); room != nil {
			// 在注销客户端之前，广播玩家离开消息。
			if c.PlayerID != "" {
				room.broadcastToAll(models.WSMessage{
					Type: "player_left",
					Data: map[string]any{
						"playerId": c.PlayerID,
					},
				})
			}
			hub.unregisterClient(c)
		}

		if c.Conn != nil {
			c.Conn.Close()
		}
	})
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
