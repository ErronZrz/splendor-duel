package game

import (
	"fmt"
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
		ID:           playerID,
		Name:         req.PlayerName,
		Gems:         make(map[models.GemType]int),
		Bonus:        make(map[models.GemType]int),
		ReservedCards: []models.DevelopmentCard{},
		PlayedCards:  []models.DevelopmentCard{},
		PrivilegeTokens: 0,
		Crowns:       0,
		Nobles:       []models.NobleCard{},
		Points:       0,
		IsHost:       true,
		LastActive:   time.Now(),
	}

	// 创建游戏状态
	gameState := models.GameState{
		Status:        "waiting",
		CurrentTurn:   "",
		AvailableGems: initializeGems(),
		DevelopmentCards: map[models.CardLevel][]models.DevelopmentCard{
			models.Level1: getDevelopmentCards(1),
			models.Level2: getDevelopmentCards(2),
			models.Level3: getDevelopmentCards(3),
		},
		NobleCards: getNobleCards(),
		Players:    map[string]models.Player{playerID: player},
		CreatedAt:  time.Now(),
	}

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
		ID:           playerID,
		Name:         req.PlayerName,
		Gems:         make(map[models.GemType]int),
		Bonus:        make(map[models.GemType]int),
		ReservedCards: []models.DevelopmentCard{},
		PlayedCards:  []models.DevelopmentCard{},
		PrivilegeTokens: 0,
		Crowns:       0,
		Nobles:       []models.NobleCard{},
		Points:       0,
		IsHost:       false,
		LastActive:   time.Now(),
	}

	// 添加玩家到房间
	m.mutex.Lock()
	targetRoom.GameState.Players[playerID] = player
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

// 初始化宝石
func initializeGems() map[models.GemType]int {
	return map[models.GemType]int{
		models.GemWhite: 4,
		models.GemBlue:  4,
		models.GemGreen: 4,
		models.GemRed:   4,
		models.GemBlack: 4,
		models.GemPearl: 4,
		models.GemGold:  5,
	}
}

// 获取发展卡（根据实际命名规则）
func getDevelopmentCards(level models.CardLevel) []models.DevelopmentCard {
	cards := []models.DevelopmentCard{}
	
	// 根据等级生成不同数量的卡片
	var count int
	
	switch level {
	case models.Level1:
		count = 30
	case models.Level2:
		count = 24
	case models.Level3:
		count = 13
	}

	// 生成卡片ID和图片路径
	for i := 0; i < count; i++ {
		// 计算字母和数字
		letterIndex := i / 10
		numberIndex := i % 10
		
		// 生成字母 (a-g, h-l, m-o)
		letter := string(rune('a' + letterIndex))
		if level == models.Level2 {
			letter = string(rune('h' + letterIndex))
		} else if level == models.Level3 {
			letter = string(rune('m' + letterIndex))
		}
		
		cardID := fmt.Sprintf("%s%d", letter, numberIndex+1)
		imagePath := fmt.Sprintf("/images/cards/level%d/%s.jpg", level, cardID)
		
		card := models.DevelopmentCard{
			ID:        cardID,
			Level:     level,
			Points:    int(level) * 2,
			Bonus:     getRandomGemType(), // 随机分配宝石类型
			Cost:      generateRandomCost(level),
			ImagePath: imagePath,
		}
		cards = append(cards, card)
	}

	return cards
}

// 获取随机宝石类型
func getRandomGemType() models.GemType {
	gemTypes := []models.GemType{
		models.GemWhite, models.GemBlue, models.GemGreen,
		models.GemRed, models.GemBlack, models.GemPearl,
	}
	return gemTypes[time.Now().UnixNano()%int64(len(gemTypes))]
}

// 生成随机成本
func generateRandomCost(level models.CardLevel) map[models.GemType]int {
	cost := make(map[models.GemType]int)
	
	// 根据等级生成不同复杂度的成本
	var totalCost int
	switch level {
	case models.Level1:
		totalCost = 2 + int(time.Now().UnixNano()%3) // 2-4
	case models.Level2:
		totalCost = 4 + int(time.Now().UnixNano()%3) // 4-6
	case models.Level3:
		totalCost = 6 + int(time.Now().UnixNano()%3) // 6-8
	}
	
	// 随机分配成本到不同宝石类型
	gemTypes := []models.GemType{
		models.GemWhite, models.GemBlue, models.GemGreen,
		models.GemRed, models.GemBlack, models.GemPearl,
	}
	
	remainingCost := totalCost
	for i := 0; i < len(gemTypes) && remainingCost > 0; i++ {
		if remainingCost > 0 {
			costAmount := 1 + int(time.Now().UnixNano()%int64(remainingCost))
			if costAmount > 0 {
				cost[gemTypes[i]] = costAmount
				remainingCost -= costAmount
			}
		}
	}
	
	return cost
}

// 获取贵族卡
func getNobleCards() []models.NobleCard {
	return []models.NobleCard{
		{
			ID:        "noble1",
			Points:    3,
			Requirement: map[models.GemType]int{models.GemWhite: 3, models.GemBlue: 3},
			ImagePath: "/images/nobles/noble1.jpg",
		},
		{
			ID:        "noble2",
			Points:    3,
			Requirement: map[models.GemType]int{models.GemGreen: 3, models.GemRed: 3},
			ImagePath: "/images/nobles/noble2.jpg",
		},
		{
			ID:        "noble3",
			Points:    3,
			Requirement: map[models.GemType]int{models.GemBlack: 3, models.GemPearl: 3},
			ImagePath: "/images/nobles/noble3.jpg",
		},
		{
			ID:        "noble4",
			Points:    3,
			Requirement: map[models.GemType]int{models.GemWhite: 2, models.GemBlue: 2, models.GemGreen: 2},
			ImagePath: "/images/nobles/noble4.jpg",
		},
	}
}
