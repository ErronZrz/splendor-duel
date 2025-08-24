package game

import (
	"log"
	"net/http"
	"sync"
	"time"

	"splendor-duel-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Manager 游戏管理器
type Manager struct {
	rooms map[string]*models.Room
	mutex sync.RWMutex
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
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "请求参数无效",
		})
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
		ID:                playerID,
		Name:              req.PlayerName,
		Gems:              make(map[models.GemType]int),
		Bonus:             make(map[models.GemType]int),
		ReservedCards:     []string{},
		DevelopmentCards:  []string{},
		PrivilegeTokens:   0,
		Crowns:            0,
		Nobles:            []string{},
		Points:            0,
		IsHost:            true,
		LastActive:        time.Now(),
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

	// 保存房间
	m.mutex.Lock()
	m.rooms[roomID] = room
	m.mutex.Unlock()

	log.Printf("创建房间: %s (ID: %s), 玩家: %s", req.RoomName, roomID, req.PlayerName)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: models.CreateRoomResponse{
			Room:     *room,
			PlayerID: playerID,
		},
	})
}

// JoinRoom 加入房间
func (m *Manager) JoinRoom(c *gin.Context) {
	var req models.JoinRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "请求参数无效",
		})
		return
	}

	// 查找房间
	m.mutex.RLock()
	var targetRoom *models.Room
	for _, room := range m.rooms {
		if room.Name == req.RoomName {
			targetRoom = room
			break
		}
	}
	m.mutex.RUnlock()

	if targetRoom == nil {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "房间不存在",
		})
		return
	}

	// 检查房间是否已满
	if len(targetRoom.GameState.Players) >= 2 {
		c.JSON(http.StatusConflict, models.APIResponse{
			Success: false,
			Message: "房间已满",
		})
		return
	}

	// 检查玩家名是否重复
	for _, player := range targetRoom.GameState.Players {
		if player.Name == req.PlayerName {
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
		ID:                playerID,
		Name:              req.PlayerName,
		Gems:              make(map[models.GemType]int),
		Bonus:             make(map[models.GemType]int),
		ReservedCards:     []string{},
		DevelopmentCards:  []string{},
		PrivilegeTokens:   0,
		Crowns:            0,
		Nobles:            []string{},
		Points:            0,
		IsHost:            false,
		LastActive:        time.Now(),
	}

	// 添加玩家到房间
	m.mutex.Lock()
	targetRoom.GameState.Players = append(targetRoom.GameState.Players, player)
	targetRoom.UpdatedAt = time.Now()
	m.mutex.Unlock()

	log.Printf("玩家 %s 加入房间: %s", req.PlayerName, req.RoomName)

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data: models.JoinRoomResponse{
			Room:     *targetRoom,
			PlayerID: playerID,
		},
	})
}

// GetRoomInfo 获取房间信息
func (m *Manager) GetRoomInfo(c *gin.Context) {
	roomID := c.Param("roomId")

	m.mutex.RLock()
	room, exists := m.rooms[roomID]
	m.mutex.RUnlock()

	if !exists {
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
	return m.rooms[roomID]
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
		log.Printf("清理过期房间: %s", roomID)
	}
}

// 注意：这些函数已被新的游戏逻辑替代
// 宝石初始化、发展卡生成等逻辑现在在 game_logic.go 中实现
