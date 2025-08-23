package models

import (
	"time"
)

// 宝石类型
type GemType string

const (
	GemWhite   GemType = "white"
	GemBlue    GemType = "blue"
	GemGreen   GemType = "green"
	GemRed     GemType = "red"
	GemBlack   GemType = "black"
	GemPearl   GemType = "pearl"
	GemGold    GemType = "gold"
	GemGray    GemType = "gray"  // 灰色/百搭色
)

// 发展卡等级
type CardLevel int

const (
	Level1 CardLevel = 1
	Level2 CardLevel = 2
	Level3 CardLevel = 3
)

// 发展卡效果类型
type CardEffect string

const (
	ExtraToken     CardEffect = "extra_token"      // 额外token
	NewTurn        CardEffect = "new_turn"         // 新的回合
	Wildcard       CardEffect = "wildcard"         // 百搭颜色
	GetPrivilege   CardEffect = "get_privilege"    // 获取特权
	Steal          CardEffect = "steal"            // 窃取
)

// 发展卡
type DevelopmentCard struct {
	ID          string            `json:"id"`
	Level       CardLevel         `json:"level"`
	Code        string            `json:"code"`        // 代号
	Color       GemType           `json:"color"`      // 卡牌颜色
	Points      int               `json:"points"`
	Crowns      int               `json:"crowns"`     // 皇冠数量
	Bonus       GemType           `json:"bonus"`
	Cost        map[GemType]int   `json:"cost"`
	Effects     []CardEffect      `json:"effects"`    // 一次性效果
	IsSpecial   bool              `json:"isSpecial"`  // 是否为特殊卡
	ImagePath   string            `json:"imagePath"`
}

// 贵族卡
type NobleCard struct {
	ID        string            `json:"id"`
	Points    int               `json:"points"`
	Requirement map[GemType]int `json:"requirement"`
	ImagePath string            `json:"imagePath"`
}

// 玩家
type Player struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Gems         map[GemType]int  `json:"gems"`           // 持有的7种宝石token数量
	Bonus        map[GemType]int  `json:"bonus"`          // 持有的5种一般颜色bonus数量（来自发展卡）
	ReservedCards []DevelopmentCard `json:"reservedCards"` // 保留的发展卡
	PlayedCards  []DevelopmentCard `json:"playedCards"`   // 已打出的发展卡
	PrivilegeTokens int            `json:"privilegeTokens"` // 特权指示物数量
	Crowns       int               `json:"crowns"`        // 皇冠数量
	Nobles       []NobleCard      `json:"nobles"`        // 已获取的贵族
	Points       int               `json:"points"`        // 分数
	IsHost       bool              `json:"isHost"`
	LastActive   time.Time         `json:"lastActive"`
}

// 游戏状态
type GameState struct {
	Status       string           `json:"status"` // "waiting", "playing", "finished"
	CurrentTurn  string           `json:"currentTurn"` // 当前玩家ID
	AvailableGems map[GemType]int `json:"availableGems"`
	DevelopmentCards map[CardLevel][]DevelopmentCard `json:"developmentCards"`
	NobleCards   []NobleCard     `json:"nobleCards"`
	Players      map[string]Player `json:"players"`
	Winner       string           `json:"winner,omitempty"`
	CreatedAt    time.Time        `json:"createdAt"`
	StartedAt    time.Time        `json:"startedAt,omitempty"`
}

// 房间
type Room struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	GameState GameState `json:"gameState"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// 聊天消息
type ChatMessage struct {
	ID         string    `json:"id"`
	PlayerID   string    `json:"playerId"`
	PlayerName string    `json:"playerName"`
	Message    string    `json:"message"`
	Timestamp  time.Time `json:"timestamp"`
}

// 游戏动作
type GameAction struct {
	ID          string                 `json:"id"`
	PlayerID    string                 `json:"playerId"`
	PlayerName  string                 `json:"playerName"`
	Type        string                 `json:"type"`
	Data        map[string]interface{} `json:"data"`
	Timestamp   time.Time              `json:"timestamp"`
	Description string                 `json:"description"`
}

// API 响应
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// 创建房间请求
type CreateRoomRequest struct {
	RoomName   string `json:"roomName" binding:"required"`
	PlayerName string `json:"playerName" binding:"required"`
}

// 加入房间请求
type JoinRoomRequest struct {
	RoomName   string `json:"roomName" binding:"required"`
	PlayerName string `json:"playerName" binding:"required"`
}

// 创建房间响应
type CreateRoomResponse struct {
	Room     Room   `json:"room"`
	PlayerID string `json:"playerId"`
}

// 加入房间响应
type JoinRoomResponse struct {
	Room     Room   `json:"room"`
	PlayerID string `json:"playerId"`
}

// WebSocket 消息类型
type WSMessage struct {
	Type      string      `json:"type"`
	PlayerID  string      `json:"playerId,omitempty"`
	PlayerName string     `json:"playerName,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Message   string      `json:"message,omitempty"`
	Action    *GameAction `json:"action,omitempty"`
	GameState *GameState  `json:"gameState,omitempty"`
}
