package game

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
	"splendor-duel-backend/internal/models"
)

func createRoomForManagerTest(t *testing.T, manager *Manager, roomName string) models.CreateRoomResponse {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/rooms", bytes.NewBufferString(fmt.Sprintf(`{"roomName":%q,"playerName":"host"}`, roomName)))
	context.Request.Header.Set("Content-Type", "application/json")
	manager.CreateRoom(context)
	if recorder.Code != http.StatusOK {
		t.Fatalf("create room status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Data models.CreateRoomResponse `json:"data"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Data
}

func joinRoomStatus(manager *Manager, roomName, playerName string) int {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/rooms/join", bytes.NewBufferString(fmt.Sprintf(`{"roomName":%q,"playerName":%q}`, roomName, playerName)))
	context.Request.Header.Set("Content-Type", "application/json")
	manager.JoinRoom(context)
	return recorder.Code
}

func TestGetRoomReturnsDetachedDeepSnapshot(t *testing.T) {
	manager := NewManager()
	created := createRoomForManagerTest(t, manager, "snapshot")
	manager.UpdateRoom(created.Room.ID, func(room *models.Room) {
		room.GameState.VictoryReasons = []string{"original"}
		room.GameState.Players[0].Gems[models.GemBlue] = 2
		room.GameState.Players[0].ReservedCards = []string{"reserved"}
		room.GameState.ExtraTurns[created.PlayerID] = 1
		card := models.DevelopmentCard{ID: "card", Cost: map[models.GemType]int{models.GemRed: 3}, Effects: []models.CardEffect{models.NewTurn}}
		room.GameState.CardDetails[card.ID] = card
		room.GameState.CardMap[card.ID] = card
		room.GameState.FlippedCards[models.Level1] = []string{card.ID}
	})

	snapshot := manager.GetRoom(created.Room.ID)
	snapshot.Name = "changed"
	snapshot.GameState.VictoryReasons[0] = "changed"
	snapshot.GameState.Players[0].Gems[models.GemBlue] = 99
	snapshot.GameState.Players[0].ReservedCards[0] = "changed"
	snapshot.GameState.GemBoard[0][0] = models.GemGold
	snapshot.GameState.ExtraTurns[created.PlayerID] = 99
	snapshot.GameState.FlippedCards[models.Level1][0] = "changed"
	card := snapshot.GameState.CardDetails["card"]
	card.Cost[models.GemRed] = 99
	card.Effects[0] = models.Steal
	snapshot.GameState.CardDetails["card"] = card

	fresh := manager.GetRoom(created.Room.ID)
	if fresh.Name != "snapshot" || fresh.GameState.VictoryReasons[0] != "original" {
		t.Fatal("top-level snapshot mutation changed authoritative room")
	}
	if fresh.GameState.Players[0].Gems[models.GemBlue] != 2 || fresh.GameState.Players[0].ReservedCards[0] != "reserved" {
		t.Fatal("player snapshot mutation changed authoritative room")
	}
	if fresh.GameState.GemBoard[0][0] == models.GemGold || fresh.GameState.ExtraTurns[created.PlayerID] != 1 {
		t.Fatal("board or map snapshot mutation changed authoritative room")
	}
	if fresh.GameState.FlippedCards[models.Level1][0] != "card" || fresh.GameState.CardDetails["card"].Cost[models.GemRed] != 3 || fresh.GameState.CardDetails["card"].Effects[0] != models.NewTurn {
		t.Fatal("nested card snapshot mutation changed authoritative room")
	}
}

func TestConcurrentCreateRoomKeepsNamesUnique(t *testing.T) {
	manager := NewManager()
	var successes atomic.Int32
	var conflicts atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodPost, "/api/rooms", bytes.NewBufferString(`{"roomName":"same","playerName":"host"}`))
			context.Request.Header.Set("Content-Type", "application/json")
			manager.CreateRoom(context)
			switch recorder.Code {
			case http.StatusOK:
				successes.Add(1)
			case http.StatusConflict:
				conflicts.Add(1)
			}
		}()
	}
	wg.Wait()
	if successes.Load() != 1 || conflicts.Load() != 19 {
		t.Fatalf("successes = %d, conflicts = %d", successes.Load(), conflicts.Load())
	}
}

func TestConcurrentJoinRoomDoesNotExceedCapacity(t *testing.T) {
	manager := NewManager()
	created := createRoomForManagerTest(t, manager, "join")
	var successes atomic.Int32
	var conflicts atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			switch joinRoomStatus(manager, "join", fmt.Sprintf("player-%d", index)) {
			case http.StatusOK:
				successes.Add(1)
			case http.StatusConflict:
				conflicts.Add(1)
			}
		}(i)
	}
	wg.Wait()
	room := manager.GetRoom(created.Room.ID)
	if successes.Load() != 1 || conflicts.Load() != 19 || len(room.GameState.Players) != 2 {
		t.Fatalf("successes = %d, conflicts = %d, players = %d", successes.Load(), conflicts.Load(), len(room.GameState.Players))
	}
}
