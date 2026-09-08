package game

import (
	"bytes"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
	"unicode/utf8"

	"splendor-duel-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func bindJSONWithValidUTF8(c *gin.Context, target any) error {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil || !utf8.Valid(body) {
		return io.ErrUnexpectedEOF
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(body))
	return c.ShouldBindJSON(target)
}

// Manager 游戏管理器
type Manager struct {
	rooms map[string]*models.Room
	mutex sync.RWMutex
}

func cloneMap[K comparable, V any](source map[K]V) map[K]V {
	if source == nil {
		return nil
	}
	result := make(map[K]V, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func cloneDevelopmentCard(card models.DevelopmentCard) models.DevelopmentCard {
	card.Cost = cloneMap(card.Cost)
	card.Effects = append([]models.CardEffect(nil), card.Effects...)
	return card
}

func cloneDevelopmentCards(source map[string]models.DevelopmentCard) map[string]models.DevelopmentCard {
	if source == nil {
		return nil
	}
	result := make(map[string]models.DevelopmentCard, len(source))
	for id, card := range source {
		result[id] = cloneDevelopmentCard(card)
	}
	return result
}

func cloneGameState(source models.GameState) models.GameState {
	result := source
	result.VictoryReasons = append([]string(nil), source.VictoryReasons...)
	result.Players = append([]models.Player(nil), source.Players...)
	for i := range result.Players {
		result.Players[i].Gems = cloneMap(source.Players[i].Gems)
		result.Players[i].Bonus = cloneMap(source.Players[i].Bonus)
		result.Players[i].ReservedCards = append([]string(nil), source.Players[i].ReservedCards...)
		result.Players[i].DevelopmentCards = append([]string(nil), source.Players[i].DevelopmentCards...)
		result.Players[i].Nobles = append([]string(nil), source.Players[i].Nobles...)
	}
	if source.GemBoard != nil {
		result.GemBoard = make([][]models.GemType, len(source.GemBoard))
		for i := range source.GemBoard {
			result.GemBoard[i] = append([]models.GemType(nil), source.GemBoard[i]...)
		}
	}
	result.GemBag = append([]models.GemType(nil), source.GemBag...)
	result.UnflippedCards = cloneMap(source.UnflippedCards)
	if source.FlippedCards != nil {
		result.FlippedCards = make(map[models.CardLevel][]string, len(source.FlippedCards))
		for level, cards := range source.FlippedCards {
			result.FlippedCards[level] = append([]string(nil), cards...)
		}
	}
	result.Level1Deck = append([]string(nil), source.Level1Deck...)
	result.Level2Deck = append([]string(nil), source.Level2Deck...)
	result.Level3Deck = append([]string(nil), source.Level3Deck...)
	result.CardDetails = cloneDevelopmentCards(source.CardDetails)
	result.CardMap = cloneDevelopmentCards(source.CardMap)
	result.AvailableNobles = append([]string(nil), source.AvailableNobles...)
	result.ExtraTurns = cloneMap(source.ExtraTurns)
	return result
}

func cloneRoom(source *models.Room) *models.Room {
	if source == nil {
		return nil
	}
	result := *source
	result.GameState = cloneGameState(source.GameState)
	result.ActionReceipts = nil
	return &result
}

// NewManager 创建新的游戏管理器
func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*models.Room),
	}
}

// CreateRoom 创建房间
func (m *Manager) CreateRoom(c *gin.Context) {
	var req models.CreateRoomRequest
	if err := bindJSONWithValidUTF8(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "请求参数无效",
		})
		return
	}
	if !models.ValidRoomName(req.RoomName) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "房间名称长度无效"})
		return
	}
	if !models.ValidPlayerName(req.PlayerName) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "玩家名称长度无效"})
		return
	}

	// 检查房间名是否已存在
	m.mutex.RLock()
	for _, room := range m.rooms {
		if room.Name == req.RoomName {
			m.mutex.RUnlock()
			c.JSON(http.StatusConflict, models.APIResponse{
				Success: false,
				Message: "房间名已存在",
			})
			return
		}
	}
	m.mutex.RUnlock()

	// 生成房间ID和玩家ID
	roomID := uuid.New().String()
	playerID := uuid.New().String()

	// 创建玩家
	player := models.Player{
		ID:               playerID,
		Name:             req.PlayerName,
		Gems:             make(map[models.GemType]int),
		Bonus:            make(map[models.GemType]int),
		ReservedCards:    []string{},
		DevelopmentCards: []string{},
		PrivilegeTokens:  0,
		Crowns:           0,
		Nobles:           []string{},
		Points:           0,
		IsHost:           true,
		LastActive:       time.Now(),
	}

	// 创建游戏状态
	gameState := models.GameState{
		Status:                   models.GameStatusWaiting,
		CurrentPlayerIndex:       0,
		TurnNumber:               0,
		Players:                  []models.Player{player},
		Winner:                   "",
		GemBoard:                 make([][]models.GemType, 5),
		GemBag:                   []models.GemType{},
		AvailablePrivilegeTokens: 3,
		UnflippedCards:           map[models.CardLevel]int{},
		FlippedCards:             map[models.CardLevel][]string{},
		AvailableNobles:          []string{"noble1", "noble2", "noble3", "noble4"},
		ExtraTurns:               make(map[string]int),
		CardToRefill:             models.PendingRefill{Level: 0, Index: 0},
		NeedsGemDiscard:          false,
		GemDiscardTarget:         10,
		GemDiscardPlayerID:       "",
		CreatedAt:                time.Now(),
	}

	// 初始化宝石版图（即使在等待状态也要显示）
	gl := NewGameLogic(&gameState, m)
	gl.initializeGemBoard()
	gl.initializeDevelopmentCards()

	// 创建房间
	room := &models.Room{
		ID:        roomID,
		Name:      req.RoomName,
		GameState: gameState,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// 保存房间；在写锁内重新检查名称，避免并发创建同名房间。
	m.mutex.Lock()
	for _, existingRoom := range m.rooms {
		if existingRoom.Name == req.RoomName {
			m.mutex.Unlock()
			c.JSON(http.StatusConflict, models.APIResponse{
				Success: false,
				Message: "房间名已存在",
			})
			return
		}
	}
	m.rooms[roomID] = room
	responseRoom := cloneRoom(room)
	m.mutex.Unlock()

	log.Printf("room created")

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: models.CreateRoomResponse{
			Room:     *responseRoom,
			PlayerID: playerID,
		},
	})
}

// JoinRoom 加入房间
func (m *Manager) JoinRoom(c *gin.Context) {
	var req models.JoinRoomRequest
	if err := bindJSONWithValidUTF8(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "请求参数无效",
		})
		return
	}
	if !models.ValidRoomName(req.RoomName) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "房间名称长度无效"})
		return
	}
	if !models.ValidPlayerName(req.PlayerName) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "玩家名称长度无效"})
		return
	}

	// 查找、校验和加入必须在同一写锁内完成，避免并发请求突破人数或重名限制。
	m.mutex.Lock()
	var targetRoom *models.Room
	for _, room := range m.rooms {
		if room.Name == req.RoomName {
			targetRoom = room
			break
		}
	}
	if targetRoom == nil {
		m.mutex.Unlock()
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "房间不存在",
		})
		return
	}

	// 检查房间是否已满
	if len(targetRoom.GameState.Players) >= 2 {
		m.mutex.Unlock()
		c.JSON(http.StatusConflict, models.APIResponse{
			Success: false,
			Message: "房间已满",
		})
		return
	}

	// 检查玩家名是否重复
	for _, player := range targetRoom.GameState.Players {
		if player.Name == req.PlayerName {
			m.mutex.Unlock()
			c.JSON(http.StatusConflict, models.APIResponse{
				Success: false,
				Message: "玩家名已存在",
			})
			return
		}
	}

	// 生成玩家ID
	playerID := uuid.New().String()

	// 创建玩家
	player := models.Player{
		ID:               playerID,
		Name:             req.PlayerName,
		Gems:             make(map[models.GemType]int),
		Bonus:            make(map[models.GemType]int),
		ReservedCards:    []string{},
		DevelopmentCards: []string{},
		PrivilegeTokens:  0,
		Crowns:           0,
		Nobles:           []string{},
		Points:           0,
		IsHost:           false,
		LastActive:       time.Now(),
	}

	// 添加玩家到房间
	targetRoom.GameState.Players = append(targetRoom.GameState.Players, player)
	targetRoom.UpdatedAt = time.Now()
	responseRoom := cloneRoom(targetRoom)
	m.mutex.Unlock()

	log.Printf("room joined")

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: models.JoinRoomResponse{
			Room:     *responseRoom,
			PlayerID: playerID,
		},
	})
}

// GetRoomInfo 获取房间信息
func (m *Manager) GetRoomInfo(c *gin.Context) {
	roomID := c.Param("roomId")
	room := m.GetRoom(roomID)
	if room == nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "房间不存在",
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    room,
	})
}

// GetRoom 获取房间（内部使用）
func (m *Manager) GetRoom(roomID string) *models.Room {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return cloneRoom(m.rooms[roomID])
}

// UpdateRoom 更新房间（内部使用）
func (m *Manager) UpdateRoom(roomID string, updateFunc func(*models.Room)) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if room, exists := m.rooms[roomID]; exists {
		updateFunc(room)
		room.UpdatedAt = time.Now()
	}
}

// CleanupExpiredRooms 清理过期房间
func (m *Manager) CleanupExpiredRooms() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	now := time.Now()
	expiredRooms := []string{}

	for roomID, room := range m.rooms {
		// 检查房间是否超过24小时
		if now.Sub(room.CreatedAt) > 24*time.Hour {
			expiredRooms = append(expiredRooms, roomID)
		}
	}

	for _, roomID := range expiredRooms {
		delete(m.rooms, roomID)
		log.Printf("expired room cleaned")
	}
}

// 注意：这些函数已被新的游戏逻辑替代
// 宝石初始化、发展卡生成等逻辑现在在 game_logic.go 中实现
