package websocket

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"splendor-duel-backend/internal/game"
	"splendor-duel-backend/internal/models"
)

func TestTakeGemsRejectsMalformedPayloadBeforeHistory(t *testing.T) {
	for _, tc := range []struct {
		name     string
		position any
	}{
		{"non_object", "invalid"},
		{"missing_coordinate", map[string]any{"x": float64(0)}},
		{"out_of_bounds", map[string]any{"x": float64(5), "y": float64(0)}},
		{"fractional", map[string]any{"x": 0.5, "y": float64(0)}},
		{"gold", map[string]any{"x": float64(0), "y": float64(0)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manager := game.NewManager()
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest("POST", "/api/rooms", bytes.NewBufferString(`{"roomName":"test","playerName":"p1"}`))
			context.Request.Header.Set("Content-Type", "application/json")
			manager.CreateRoom(context)
			var response struct {
				Data models.CreateRoomResponse `json:"data"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatal(err)
			}
			roomID, playerID := response.Data.Room.ID, response.Data.PlayerID
			if roomID == "" || playerID == "" {
				t.Fatal("test room was not created")
			}
			manager.UpdateRoom(roomID, func(r *models.Room) {
				r.GameState.Status = models.GameStatusPlaying
				r.GameState.GemBoard[0][0] = models.GemGold
			})
			client := &Client{RoomID: roomID, PlayerID: playerID, Manager: manager, Send: make(chan []byte, 16)}
			room := &Room{ID: roomID, Manager: manager, Clients: map[*Client]bool{client: true}}
			before, _ := json.Marshal(manager.GetRoom(roomID).GameState)
			client.handleGameAction(models.WSMessage{
				Type: "game_action", PlayerID: playerID, ActionType: "takeGems",
				Data: map[string]any{"gemPositions": []any{tc.position}},
			}, room)
			after, _ := json.Marshal(manager.GetRoom(roomID).GameState)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected action changed game state")
			}
			if len(room.GameHistory) != 0 {
				t.Fatal("rejected action generated a success history entry")
			}
			foundError := false
			for len(client.Send) > 0 {
				var message models.WSMessage
				if err := json.Unmarshal(<-client.Send, &message); err != nil {
					t.Fatal(err)
				}
				foundError = foundError || (message.Type == "error" && message.Message != "")
			}
			if !foundError {
				t.Fatal("client received no error")
			}
		})
	}
}
