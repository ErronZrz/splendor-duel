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

func TestBuyCardPayloadPreservesEffectCompatibilityShapes(t *testing.T) {
	tests := []struct {
		name string
		data map[string]any
		want map[string]any
	}{
		{
			name: "effects_omitted_for_legacy_client",
			data: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}},
			want: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}},
		},
		{
			name: "explicit_extra_token_skip_is_nested_under_effect",
			data: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}, "effects": map[string]any{"extraToken": map[string]any{"skipped": true}}},
			want: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}, "effects": map[string]any{"extraToken": map[string]any{"skipped": true}}},
		},
		{
			name: "explicit_steal_skip_is_nested_under_effect",
			data: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}, "effects": map[string]any{"steal": map[string]any{"skipped": true}}},
			want: map[string]any{"cardId": "c1", "paymentPlan": map[string]any{}, "effects": map[string]any{"steal": map[string]any{"skipped": true}}},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var payload buyCardPayload
			if err := decodeActionPayload(tc.data, &payload); err != nil {
				t.Fatal(err)
			}
			raw, err := json.Marshal(domainPurchase(payload))
			if err != nil {
				t.Fatal(err)
			}
			var got map[string]any
			if err := json.Unmarshal(raw, &got); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("domainPurchase() JSON = %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestAllActionPayloadFixturesDecodeWithExtensions(t *testing.T) {
	fixtures := []struct {
		name   string
		data   map[string]any
		target func() any
	}{
		{"start_game", map[string]any{"future": true}, func() any { return &struct{}{} }},
		{"takeGems", map[string]any{"gemPositions": []any{map[string]any{"x": 0, "y": 1, "future": true}}, "future": true}, func() any { return &takeGemsPayload{} }},
		{"buyCard", map[string]any{"cardId": "a1", "paymentPlan": map[string]any{"white": 1}, "effects": map[string]any{"steal": map[string]any{"skipped": true, "future": true}}, "future": true}, func() any { return &buyCardPayload{} }},
		{"reserveCard", map[string]any{"cardId": "a1", "goldX": 1, "goldY": 2, "future": true}, func() any { return &reserveCardPayload{} }},
		{"spendPrivilege", map[string]any{"privilegeCount": 1, "gemPositions": []any{map[string]any{"x": 0, "y": 0}}, "future": true}, func() any { return &spendPrivilegePayload{} }},
		{"refillBoard", map[string]any{"future": true}, func() any { return &struct{}{} }},
		{"grantOpponentPrivilege", map[string]any{"future": true}, func() any { return &struct{}{} }},
		{"discardGem", map[string]any{"gemType": "white", "future": true}, func() any { return &discardGemPayload{} }},
		{"discardGemsBatch", map[string]any{"gemDiscards": map[string]any{"white": 1}, "future": true}, func() any { return &discardGemsBatchPayload{} }},
		{"endTurn", map[string]any{"future": true}, func() any { return &struct{}{} }},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			if err := decodeActionPayload(fixture.data, fixture.target()); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestKnownActionFieldsRejectWrongJSONTypes(t *testing.T) {
	fixtures := []struct {
		name   string
		data   map[string]any
		target func() any
	}{
		{"take_position", map[string]any{"gemPositions": []any{map[string]any{"x": "0", "y": 1}}}, func() any { return &takeGemsPayload{} }},
		{"buy_payment", map[string]any{"cardId": "a1", "paymentPlan": map[string]any{"white": "1"}}, func() any { return &buyCardPayload{} }},
		{"reserve_gold", map[string]any{"cardId": "a1", "goldX": 1.5, "goldY": 2}, func() any { return &reserveCardPayload{} }},
		{"privilege_count", map[string]any{"privilegeCount": "1", "gemPositions": []any{}}, func() any { return &spendPrivilegePayload{} }},
		{"discard_type", map[string]any{"gemType": 1}, func() any { return &discardGemPayload{} }},
		{"discard_count", map[string]any{"gemDiscards": map[string]any{"white": 1.5}}, func() any { return &discardGemsBatchPayload{} }},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			if err := decodeActionPayload(fixture.data, fixture.target()); err == nil {
				t.Fatal("wrong known field type was accepted")
			}
		})
	}
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

func drainActionResult(t *testing.T, client *Client) (models.ActionResult, []string) {
	t.Helper()
	var result models.ActionResult
	var types []string
	for len(client.Send) > 0 {
		var message struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(<-client.Send, &message); err != nil {
			t.Fatal(err)
		}
		types = append(types, message.Type)
		if message.Type == "action_result" {
			if err := json.Unmarshal(message.Data, &result); err != nil {
				t.Fatal(err)
			}
		}
	}
	return result, types
}

func TestRequestIDExecutesSuccessfulActionOnlyOnce(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	manager.UpdateRoom(room.ID, func(r *models.Room) {
		r.GameState.Status = models.GameStatusPlaying
		r.GameState.GemBoard[0][0] = models.GemBlue
	})
	message := models.WSMessage{Type: "game_action", PlayerID: playerID, PlayerName: "p1", ActionType: "takeGems", RequestID: "request-1", Data: map[string]any{"gemPositions": []any{map[string]any{"x": float64(0), "y": float64(0)}}}}
	client.handleGameAction(message, room)
	result, types := drainActionResult(t, client)
	if !result.Success || result.RequestID != "request-1" || result.Replayed {
		t.Fatalf("unexpected first result: %+v", result)
	}
	if len(types) == 0 || types[len(types)-1] != "action_result" {
		t.Fatalf("action result was not queued after broadcasts: %v", types)
	}

	reconnectedClient := &Client{RoomID: room.ID, PlayerID: playerID, PlayerName: "p1", Manager: manager, Send: make(chan []byte, 8)}
	reconnectedRoom := &Room{ID: room.ID, Manager: manager, Clients: map[*Client]bool{reconnectedClient: true}}
	reconnectedClient.handleGameAction(message, reconnectedRoom)
	replayed, replayTypes := drainActionResult(t, reconnectedClient)
	state := manager.GetRoom(room.ID).GameState
	if !replayed.Success || !replayed.Replayed || len(replayTypes) != 1 || replayTypes[0] != "action_result" {
		t.Fatalf("unexpected replay result/messages: %+v %v", replayed, replayTypes)
	}
	if state.Players[0].Gems[models.GemBlue] != 1 || len(room.GameHistory) != 1 {
		t.Fatal("duplicate request executed or wrote history more than once")
	}
}

func TestRequestIDCachesFailureAndRejectsActionTypeReuse(t *testing.T) {
	manager, room, client, playerID := protocolTestRoom(t)
	manager.UpdateRoom(room.ID, func(r *models.Room) {
		r.GameState.Status = models.GameStatusPlaying
		r.GameState.GemBoard[0][0] = models.GemGold
	})
	message := models.WSMessage{Type: "game_action", PlayerID: playerID, PlayerName: "p1", ActionType: "takeGems", RequestID: "failed-1", Data: map[string]any{"gemPositions": []any{map[string]any{"x": float64(0), "y": float64(0)}}}}
	client.handleGameAction(message, room)
	failed, types := drainActionResult(t, client)
	if failed.Success || failed.Message == "" {
		t.Fatalf("failure was not returned: %+v", failed)
	}
	for _, messageType := range types {
		if messageType == "error" {
			t.Fatal("requestId action also emitted legacy error")
		}
	}
	manager.UpdateRoom(room.ID, func(r *models.Room) { r.GameState.GemBoard[0][0] = models.GemBlue })
	client.handleGameAction(message, room)
	replayed, _ := drainActionResult(t, client)
	if replayed.Success || !replayed.Replayed || manager.GetRoom(room.ID).GameState.Players[0].Gems[models.GemBlue] != 0 {
		t.Fatal("cached failure was re-executed")
	}

	message.ActionType = "refillBoard"
	message.Data = map[string]any{}
	client.handleGameAction(message, room)
	collision, collisionTypes := drainActionResult(t, client)
	if collision.Success || collision.Message == "" || len(collisionTypes) != 1 {
		t.Fatalf("requestId action-type reuse was not rejected: %+v %v", collision, collisionTypes)
	}
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
