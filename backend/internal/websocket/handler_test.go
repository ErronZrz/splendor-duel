package websocket

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"sync"
	"testing"
	"time"

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

func TestBroadcastRemovesBackpressuredClientWithoutDeadlock(t *testing.T) {
	for _, broadcast := range []string{"client", "all"} {
		t.Run(broadcast, func(t *testing.T) {
			hub := NewHub()
			previousHub := globalHub
			globalHub = hub
			t.Cleanup(func() { globalHub = previousHub })
			client := &Client{RoomID: "room", Send: make(chan []byte, 1)}
			room := &Room{ID: "room", Clients: map[*Client]bool{client: true}}
			hub.Rooms[room.ID] = room
			client.Send <- []byte("full")

			done := make(chan struct{})
			go func() {
				if broadcast == "client" {
					room.broadcastToClient(client, models.WSMessage{Type: "test"})
				} else {
					room.broadcastToAll(models.WSMessage{Type: "test"})
				}
				close(done)
			}()
			select {
			case <-done:
			case <-time.After(time.Second):
				t.Fatal("broadcast deadlocked while removing a backpressured client")
			}
			if hub.getRoom(room.ID) != nil {
				t.Fatal("empty websocket room was not removed")
			}
		})
	}
}

func TestCleanupRunsOnceAndKeepsRoomWithPeer(t *testing.T) {
	hub := NewHub()
	previousHub := globalHub
	globalHub = hub
	t.Cleanup(func() { globalHub = previousHub })
	client := &Client{RoomID: "room", PlayerID: "p1", Send: make(chan []byte, 4)}
	peer := &Client{RoomID: "room", PlayerID: "p2", Send: make(chan []byte, 4)}
	room := &Room{ID: "room", Clients: map[*Client]bool{client: true, peer: true}}
	hub.Rooms[room.ID] = room

	client.cleanup()
	client.cleanup()

	if hub.getRoom(room.ID) != room {
		t.Fatal("room with a connected peer was removed")
	}
	if len(peer.Send) != 1 {
		t.Fatalf("player_left broadcasts = %d, want 1", len(peer.Send))
	}
}

func TestRegisterAndLastClientCleanupRemainAtomic(t *testing.T) {
	for i := 0; i < 100; i++ {
		hub := NewHub()
		manager := game.NewManager()
		oldClient := &Client{RoomID: "room", Send: make(chan []byte, 1)}
		oldRoom := &Room{ID: "room", Clients: map[*Client]bool{oldClient: true}, Manager: manager}
		hub.Rooms[oldRoom.ID] = oldRoom
		newClient := &Client{RoomID: "room", Send: make(chan []byte, 4)}

		var registeredRoom *Room
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			hub.unregisterClient(oldClient)
		}()
		go func() {
			defer wg.Done()
			registeredRoom = hub.registerClient("room", manager, newClient)
		}()
		wg.Wait()

		currentRoom := hub.getRoom("room")
		if currentRoom == nil || currentRoom != registeredRoom {
			t.Fatal("new client was registered into a detached room")
		}
		currentRoom.mutex.RLock()
		registered := currentRoom.Clients[newClient]
		currentRoom.mutex.RUnlock()
		if !registered {
			t.Fatal("new client is missing from the current hub room")
		}
	}
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

func TestTopLevelStartGameReportsFailure(t *testing.T) {
	_, room, client, playerID := protocolTestRoom(t)
	client.PlayerID, client.PlayerName = playerID, "p1"
	client.handleStartGame(room)
	expectClientError(t, client)
}

func TestGameActionsReportProtocolAndRuleErrors(t *testing.T) {
	for _, tc := range []struct {
		name       string
		actionType string
		data       any
	}{
		{"missing_data", "takeGems", nil},
		{"missing_action_type", "", map[string]any{}},
		{"unknown_action_type", "notSupported", map[string]any{}},
		{"malformed_typed_payload", "takeGems", "invalid"},
		{"start_game_with_one_player", "start_game", map[string]any{}},
		{"refill_empty_bag", "refillBoard", map[string]any{}},
		{"discard_when_not_required", "discardGem", map[string]any{"gemType": "blue"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manager, room, client, playerID := protocolTestRoom(t)
			client.PlayerID, client.PlayerName = playerID, "p1"
			before, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			client.handleGameAction(models.WSMessage{
				Type: "game_action", PlayerID: playerID, PlayerName: "p1",
				ActionType: tc.actionType, Data: tc.data,
			}, room)
			after, _ := json.Marshal(manager.GetRoom(room.ID).GameState)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected action changed game state")
			}
			if len(room.GameHistory) != 0 {
				t.Fatal("rejected action generated success history")
			}
			expectClientError(t, client)
		})
	}
}

func TestTypedActionPayloadKeepsLegacyFieldsAndAllowsExtensions(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	manager.UpdateRoom(room.ID, func(r *models.Room) {
		r.GameState.Status = models.GameStatusPlaying
		r.GameState.GemBoard[0][0] = models.GemBlue
	})
	client.PlayerID, client.PlayerName = playerID, "p1"

	client.handleGameAction(models.WSMessage{
		Type: "game_action", PlayerID: playerID, PlayerName: "p1", ActionType: "takeGems",
		Data: map[string]any{
			"gemPositions":        []any{map[string]any{"x": float64(0), "y": float64(0), "futureField": true}},
			"futureEnvelopeField": "compatible",
		},
	}, room)

	state := manager.GetRoom(room.ID).GameState
	if state.Players[0].Gems[models.GemBlue] != 1 || state.GemBoard[0][0] != "" {
		t.Fatal("legacy takeGems payload did not execute")
	}
	if len(room.GameHistory) != 1 {
		t.Fatal("successful legacy action did not generate history")
	}
	for len(client.Send) > 0 {
		var message models.WSMessage
		if err := json.Unmarshal(<-client.Send, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type == "error" {
			t.Fatalf("compatible extension field was rejected: %s", message.Message)
		}
	}
}

func TestTypedBuyPayloadKeepsOptionalLegacyFields(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	manager.UpdateRoom(room.ID, func(r *models.Room) {
		r.GameState.Status = models.GameStatusPlaying
		card := models.DevelopmentCard{
			ID: "free-card", Level: models.Level1, Bonus: models.GemBlue,
			Cost: map[models.GemType]int{},
		}
		r.GameState.CardMap[card.ID] = card
		r.GameState.CardDetails[card.ID] = card
		r.GameState.FlippedCards[models.Level1] = []string{card.ID}
	})
	client.PlayerID, client.PlayerName = playerID, "p1"

	// paymentPlan and effects were optional in the legacy protocol for a free card.
	client.handleGameAction(models.WSMessage{
		Type: "game_action", PlayerID: playerID, PlayerName: "p1", ActionType: "buyCard",
		Data: map[string]any{"cardId": "free-card", "futureField": true},
	}, room)

	state := manager.GetRoom(room.ID).GameState
	if !reflect.DeepEqual(state.Players[0].DevelopmentCards, []string{"free-card"}) {
		t.Fatal("typed purchase decoder changed optional legacy fields")
	}
	if len(room.GameHistory) != 1 {
		t.Fatal("successful purchase did not generate history")
	}
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
