package websocket

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
	"splendor-duel-backend/internal/game"
	"splendor-duel-backend/internal/models"
)

func protocolTestRoom(t *testing.T) (*game.Manager, *Room, *Client, string) {
	t.Helper()
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
	client := &Client{RoomID: response.Data.Room.ID, Manager: manager, Send: make(chan []byte, 32)}
	room := &Room{ID: response.Data.Room.ID, Manager: manager, Clients: map[*Client]bool{client: true}}
	previousHub := globalHub
	globalHub = NewHub()
	globalHub.Rooms[room.ID] = room
	t.Cleanup(func() { globalHub = previousHub })
	return manager, room, client, response.Data.PlayerID
}

func expectClientError(t *testing.T, client *Client) {
	t.Helper()
	for len(client.Send) > 0 {
		var message models.WSMessage
		if err := json.Unmarshal(<-client.Send, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type == "error" && message.Message != "" {
			return
		}
	}
	t.Fatal("client received no protocol error")
}

func TestProtocolBindsConnectionToExistingPlayer(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	beforePlayers := append([]models.Player(nil), manager.GetRoom(room.ID).GameState.Players...)

	unknownJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: "unknown", PlayerName: "intruder"})
	client.handleMessage(unknownJoin)
	expectClientError(t, client)
	if client.PlayerID != "" || !reflect.DeepEqual(beforePlayers, manager.GetRoom(room.ID).GameState.Players) {
		t.Fatal("unknown WebSocket identity was added to the room")
	}

	validJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: playerID, PlayerName: "p1"})
	client.handleMessage(validJoin)
	if client.PlayerID != playerID || client.PlayerName != "p1" {
		t.Fatal("existing room player was not bound to the connection")
	}
}

func TestProtocolRejectsIdentitySwitchAndPreJoinMessages(t *testing.T) {
	_, room, client, playerID := protocolTestRoom(t)
	preJoinChat, _ := json.Marshal(models.WSMessage{Type: "chat_message", PlayerID: playerID, PlayerName: "p1", Message: "hello"})
	client.handleMessage(preJoinChat)
	expectClientError(t, client)
	if len(room.ChatMessages) != 0 {
		t.Fatal("pre-join chat message was accepted")
	}

	validJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: playerID, PlayerName: "p1"})
	client.handleMessage(validJoin)
	for len(client.Send) > 0 {
		<-client.Send
	}

	spoofedChat, _ := json.Marshal(models.WSMessage{Type: "chat_message", PlayerID: "another-player", PlayerName: "spoofed", Message: "hello"})
	client.handleMessage(spoofedChat)
	expectClientError(t, client)
	if len(room.ChatMessages) != 0 {
		t.Fatal("message with a switched identity was accepted")
	}

	switchedJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: "another-player", PlayerName: "spoofed"})
	client.handleMessage(switchedJoin)
	expectClientError(t, client)
	if client.PlayerID != playerID || client.PlayerName != "p1" {
		t.Fatal("repeated player_join switched the bound identity")
	}
}

func TestProtocolUsesBoundPlayerName(t *testing.T) {
	_, room, client, playerID := protocolTestRoom(t)
	validJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: playerID, PlayerName: "p1"})
	client.handleMessage(validJoin)

	chat, _ := json.Marshal(models.WSMessage{Type: "chat_message", PlayerID: playerID, PlayerName: "spoofed", Message: "hello"})
	client.handleMessage(chat)
	if len(room.ChatMessages) != 1 || room.ChatMessages[0].PlayerName != "p1" {
		t.Fatal("chat history used an untrusted player name")
	}
}

func TestProtocolReportsMalformedAndUnknownMessages(t *testing.T) {
	_, _, client, playerID := protocolTestRoom(t)
	client.handleMessage([]byte(`{"type":`))
	expectClientError(t, client)

	validJoin, _ := json.Marshal(models.WSMessage{Type: "player_join", PlayerID: playerID, PlayerName: "p1"})
	client.handleMessage(validJoin)
	for len(client.Send) > 0 {
		<-client.Send
	}
	unknown, _ := json.Marshal(models.WSMessage{Type: "not_supported", PlayerID: playerID})
	client.handleMessage(unknown)
	expectClientError(t, client)
}

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

func TestSpendPrivilegeRejectsMalformedPayloadBeforeHistory(t *testing.T) {
	for _, tc := range []struct {
		name      string
		count     any
		positions any
	}{
		{"non_numeric_count", "1", []any{}},
		{"fractional_count", 1.5, []any{map[string]any{"x": float64(0), "y": float64(0)}}},
		{"non_array_positions", float64(1), "invalid"},
		{"non_object_position", float64(1), []any{"invalid"}},
		{"missing_coordinate", float64(1), []any{map[string]any{"x": float64(0)}}},
		{"fractional_coordinate", float64(1), []any{map[string]any{"x": 0.5, "y": float64(0)}}},
		{"out_of_bounds", float64(1), []any{map[string]any{"x": float64(5), "y": float64(0)}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manager, room, client, playerID := protocolTestRoom(t)
			manager.UpdateRoom(room.ID, func(r *models.Room) {
				r.GameState.Status = models.GameStatusPlaying
				r.GameState.Players[0].PrivilegeTokens = 2
				r.GameState.GemBoard[0][0] = models.GemBlue
			})
			client.PlayerID, client.PlayerName = playerID, "p1"
			before, _ := json.Marshal(manager.GetRoom(room.ID).GameState)

			client.handleGameAction(models.WSMessage{
				Type: "game_action", PlayerID: playerID, PlayerName: "p1", ActionType: "spendPrivilege",
				Data: map[string]any{"privilegeCount": tc.count, "gemPositions": tc.positions},
			}, room)

			after, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected privilege action changed game state")
			}
			if len(room.GameHistory) != 0 {
				t.Fatal("rejected privilege action generated success history")
			}
			expectClientError(t, client)
		})
	}
}

func TestReserveCardRejectsMalformedCoordinatesBeforeHistory(t *testing.T) {
	for _, tc := range []struct {
		name  string
		goldX any
		goldY any
	}{
		{"missing_x", nil, float64(0)},
		{"string_x", "0", float64(0)},
		{"fractional_x", 0.5, float64(0)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manager, room, client, playerID := protocolTestRoom(t)
			manager.UpdateRoom(room.ID, func(r *models.Room) {
				r.GameState.Status = models.GameStatusPlaying
				r.GameState.GemBoard[0][0] = models.GemGold
				r.GameState.FlippedCards[models.Level1] = []string{"card-1"}
			})
			before, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			client.handleGameAction(models.WSMessage{
				PlayerID: playerID, PlayerName: "p1", ActionType: "reserveCard",
				Data: map[string]any{"cardId": "card-1", "goldX": tc.goldX, "goldY": tc.goldY},
			}, room)
			after, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			if !bytes.Equal(before, after) || len(room.GameHistory) != 0 {
				t.Fatal("rejected reservation changed state or history")
			}
			expectClientError(t, client)
		})
	}
}

func TestBuyCardRejectsMalformedEffectBeforeHistory(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	manager.UpdateRoom(room.ID, func(r *models.Room) {
		r.GameState.Status = models.GameStatusPlaying
		card := models.DevelopmentCard{ID: "extra", Level: models.Level1, Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}, Cost: map[models.GemType]int{}}
		r.GameState.CardMap[card.ID], r.GameState.CardDetails[card.ID] = card, card
		r.GameState.FlippedCards[models.Level1] = []string{card.ID}
	})
	before, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
	client.handleGameAction(models.WSMessage{
		PlayerID: playerID, PlayerName: "p1", ActionType: "buyCard",
		Data: map[string]any{
			"cardId": "extra", "paymentPlan": map[string]any{},
			"effects": map[string]any{"extraToken": map[string]any{"selectedGem": map[string]any{"x": "bad", "y": float64(0)}}},
		},
	}, room)
	after, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
	if !bytes.Equal(before, after) || len(room.GameHistory) != 0 {
		t.Fatal("rejected purchase changed state or history")
	}
	expectClientError(t, client)
}

func TestDiscardBatchRejectsMalformedPayloadBeforeHistory(t *testing.T) {
	for _, tc := range []struct {
		name     string
		discards any
	}{
		{"non_object", "invalid"},
		{"fractional", map[string]any{"blue": 1.5}},
		{"negative", map[string]any{"blue": float64(-1)}},
		{"unknown_type", map[string]any{"ruby": float64(2)}},
		{"over_discard", map[string]any{"blue": float64(3)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manager, room, client, playerID := protocolTestRoom(t)
			manager.UpdateRoom(room.ID, func(r *models.Room) {
				r.GameState.Status = models.GameStatusPlaying
				r.GameState.NeedsGemDiscard = true
				r.GameState.GemDiscardPlayerID = playerID
				r.GameState.Players[0].Gems[models.GemBlue] = 12
			})
			before, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			client.handleGameAction(models.WSMessage{
				PlayerID: playerID, PlayerName: "p1", ActionType: "discardGemsBatch",
				Data: map[string]any{"gemDiscards": tc.discards},
			}, room)
			after, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			if !bytes.Equal(before, after) || len(room.GameHistory) != 0 {
				t.Fatal("rejected discard changed state or history")
			}
			expectClientError(t, client)
		})
	}
}
