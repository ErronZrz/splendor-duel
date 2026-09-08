package main

import (
	"log"
	"os"
	"time"

	"splendor-duel-backend/internal/game"
	"splendor-duel-backend/internal/security"
	"splendor-duel-backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

func main() {
	// 创建游戏管理器
	gameManager := game.NewManager()

	// 启动房间清理协程（每24小时清理一次）
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			gameManager.CleanupExpiredRooms()
		}
	}()

	// 设置 Gin 路由
	r := gin.Default()

	originPolicy := security.NewOriginPolicy(os.Getenv(security.AllowedOriginsEnv))

	// CORS and WebSocket upgrades share the same exact-origin policy.
	r.Use(func(c *gin.Context) {
		if !originPolicy.ApplyCORS(c.Writer, c.Request) {
			c.AbortWithStatusJSON(403, map[string]any{"success": false, "message": "来源不被允许"})
			return
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// API 路由
	api := r.Group("/api")
	{
		// 房间管理
		api.POST("/rooms", gameManager.CreateRoom)
		api.POST("/rooms/join", gameManager.JoinRoom)
		api.GET("/rooms/:roomId", gameManager.GetRoomInfo)
	}

	// WebSocket 路由
	r.GET("/ws/:roomId", func(c *gin.Context) {
		roomId := c.Param("roomId")
		websocket.HandleWebSocket(c.Writer, c.Request, roomId, gameManager, originPolicy)
	})

	// 启动服务器
	log.Println("服务器启动在端口 8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("启动服务器失败:", err)
	}
}
