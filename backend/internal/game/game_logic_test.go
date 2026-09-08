package game

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"

	"splendor-duel-backend/internal/models"
)

// Tests use deterministic positions and players; no live rooms are involved.
func regressionGame() (*GameLogic, *models.GameState) {
	s := &models.GameState{
		Status: models.GameStatusPlaying, TurnNumber: 1,
		AvailablePrivilegeTokens: 3, GemDiscardTarget: 10,
		ExtraTurns:     map[string]int{},
		FlippedCards:   map[models.CardLevel][]string{},
		UnflippedCards: map[models.CardLevel]int{},
		CardDetails:    map[string]models.DevelopmentCard{},
		CardMap:        map[string]models.DevelopmentCard{},
	}
	for _, id := range []string{"p1", "p2"} {
		s.Players = append(s.Players, models.Player{
			ID: id, Name: id, Gems: map[models.GemType]int{}, Bonus: map[models.GemType]int{},
		})
	}
	for i := 0; i < 5; i++ {
		s.GemBoard = append(s.GemBoard, make([]models.GemType, 5))
	}
	return NewGameLogic(s, NewManager()), s
}

func gemPositions(points ...[2]int) []models.BoardPosition {
	positions := make([]models.BoardPosition, 0, len(points))
	for _, p := range points {
		positions = append(positions, models.BoardPosition{X: p[0], Y: p[1]})
	}
	return positions
}

func purchaseSelection(cardID string, effects map[string]any) models.PurchaseSelection {
	purchase := models.PurchaseSelection{CardID: cardID, PaymentPlan: models.PaymentPlan{}}
	if effects == nil {
		return purchase
	}
	raw, _ := json.Marshal(effects)
	purchase.Effects = &models.PurchaseEffects{}
	if err := json.Unmarshal(raw, purchase.Effects); err != nil {
		panic(err)
	}
	return purchase
}

func TestRegressionTakeGems(t *testing.T) {
	for _, tc := range []struct {
		name   string
		points [][2]int
	}{
		{"single", [][2]int{{2, 2}}},
		{"row_out_of_order", [][2]int{{2, 2}, {2, 1}, {2, 3}}},
		{"column", [][2]int{{1, 2}, {2, 2}, {3, 2}}},
		{"diagonal", [][2]int{{1, 1}, {2, 2}, {3, 3}}},
		{"reverse_diagonal", [][2]int{{1, 3}, {2, 2}, {3, 1}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, s := regressionGame()
			for _, p := range tc.points {
				s.GemBoard[p[0]][p[1]] = models.GemBlue
			}
			if err := gl.TakeGems("p1", gemPositions(tc.points...)); err != nil {
				t.Fatal(err)
			}
			if s.Players[0].Gems[models.GemBlue] != len(tc.points) || s.CurrentPlayerIndex != 1 || s.TurnNumber != 2 {
				t.Fatalf("unexpected resources or turn: %+v", s)
			}
			for _, p := range tc.points {
				if s.GemBoard[p[0]][p[1]] != "" {
					t.Fatal("taken gem remains on board")
				}
			}
		})
	}
}

func TestRegressionDiscardBeforeTurnChange(t *testing.T) {
	gl, s := regressionGame()
	s.Players[0].Gems[models.GemBlue] = 9
	s.Players[0].Gems[models.GemGold] = 3
	if err := gl.HandleTurnEnd(); err != nil {
		t.Fatal(err)
	}
	if !s.NeedsGemDiscard || s.GemDiscardPlayerID != "p1" || s.CurrentPlayerIndex != 0 {
		t.Fatal("discard must keep the current player")
	}
	if err := gl.DiscardGemsBatch("p1", map[models.GemType]int{models.GemGold: 2}); err != nil {
		t.Fatal(err)
	}
	if s.NeedsGemDiscard || s.CurrentPlayerIndex != 0 || len(s.GemBag) != 2 {
		t.Fatal("discard must return tokens and await turn completion")
	}
	if err := gl.HandleTurnEnd(); err != nil {
		t.Fatal(err)
	}
	if s.CurrentPlayerIndex != 1 {
		t.Fatal("turn did not advance after discard")
	}
}

func TestRegressionPrivilegeTransfer(t *testing.T) {
	gl, s := regressionGame()
	for i := 0; i < 3; i++ {
		if err := gl.TakePrivilegeToken("p2"); err != nil {
			t.Fatal(err)
		}
	}
	if err := gl.TakePrivilegeToken("p1"); err != nil {
		t.Fatal(err)
	}
	if s.AvailablePrivilegeTokens != 0 || s.Players[0].PrivilegeTokens != 1 || s.Players[1].PrivilegeTokens != 2 {
		t.Fatal("public supply exhaustion must transfer an opponent privilege")
	}
}

func TestRegressionExtraTurn(t *testing.T) {
	gl, s := regressionGame()
	s.ExtraTurns["p1"] = 1
	s.RefilledThisTurn = true
	if err := gl.HandleTurnEnd(); err != nil {
		t.Fatal(err)
	}
	if s.CurrentPlayerIndex != 0 || s.ExtraTurns["p1"] != 0 || s.RefilledThisTurn {
		t.Fatal("extra turn must retain player and reset optional actions")
	}
	if err := gl.HandleTurnEnd(); err != nil {
		t.Fatal(err)
	}
	if s.CurrentPlayerIndex != 1 {
		t.Fatal("extra turn was granted more than once")
	}
}

func TestRegressionVictory(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		points, crowns, colorPoints int
		won                         bool
	}{
		{"below_thresholds", 19, 9, 9, false},
		{"points", 20, 0, 0, true},
		{"crowns", 0, 10, 0, true},
		{"single_color_points", 0, 0, 10, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, s := regressionGame()
			p := &s.Players[0]
			p.Points, p.Crowns = tc.points, tc.crowns
			p.DevelopmentCards = []string{"test-card"}
			s.CardDetails["test-card"] = models.DevelopmentCard{Color: models.GemBlue, Points: tc.colorPoints}
			won, _ := gl.checkVictoryForPlayer(p)
			if won != tc.won {
				t.Fatalf("won = %v, want %v", won, tc.won)
			}
		})
	}
}

// These boundary tests express existing README/frontend restrictions. They are
// deliberately not weakened to accept legacy backend behavior; any failures
// require an explicit decision before the rules engine is changed.
func TestRuleBoundaryTakeGems(t *testing.T) {
	for _, tc := range []struct {
		name   string
		points [][2]int
		gems   []models.GemType
	}{
		{"gold_is_not_a_normal_take", [][2]int{{0, 0}}, []models.GemType{models.GemGold}},
		{"three_gems_must_be_adjacent", [][2]int{{0, 0}, {0, 2}, {0, 4}}, []models.GemType{models.GemBlue, models.GemBlue, models.GemBlue}},
		{"rejected_action_is_atomic", [][2]int{{0, 0}, {0, 1}}, []models.GemType{models.GemBlue, ""}},
		{"duplicate_position", [][2]int{{0, 0}, {0, 0}}, []models.GemType{models.GemBlue, models.GemBlue}},
		{"separated_reverse_diagonal", [][2]int{{0, 4}, {2, 2}}, []models.GemType{models.GemBlue, models.GemBlue}},
		{"mixed_gold_is_atomic", [][2]int{{0, 0}, {0, 1}}, []models.GemType{models.GemBlue, models.GemGold}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, s := regressionGame()
			for i, p := range tc.points {
				s.GemBoard[p[0]][p[1]] = tc.gems[i]
			}
			before, err := json.Marshal(s)
			if err != nil {
				t.Fatal(err)
			}
			actionErr := gl.TakeGems("p1", gemPositions(tc.points...))
			after, err := json.Marshal(s)
			if err != nil {
				t.Fatal(err)
			}
			if actionErr == nil {
				t.Error("illegal selection was accepted")
			}
			if !reflect.DeepEqual(before, after) {
				t.Error("invalid selection changed game state")
			}
		})
	}
}

func TestRuleBoundaryInvalidCoordinates(t *testing.T) {
	for _, tc := range []struct {
		name     string
		position models.BoardPosition
	}{
		{"negative_coordinate", models.BoardPosition{X: -1, Y: 0}},
		{"out_of_bounds", models.BoardPosition{X: 5, Y: 0}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, s := regressionGame()
			s.GemBoard[0][0] = models.GemBlue
			before, _ := json.Marshal(s)
			if err := gl.TakeGems("p1", []models.BoardPosition{tc.position}); err == nil {
				t.Fatal("invalid coordinate was accepted")
			}
			after, _ := json.Marshal(s)
			if !reflect.DeepEqual(before, after) {
				t.Fatal("invalid coordinate changed state")
			}
		})
	}
}

func TestRegressionSpendPrivilege(t *testing.T) {
	gl, state := regressionGame()
	state.Players[0].PrivilegeTokens = 2
	state.AvailablePrivilegeTokens = 1
	state.GemBoard[0][0] = models.GemBlue
	state.GemBoard[1][1] = models.GemRed

	if err := gl.SpendPrivilege("p1", 2, gemPositions([2]int{0, 0}, [2]int{1, 1})); err != nil {
		t.Fatal(err)
	}
	if state.Players[0].PrivilegeTokens != 0 || state.AvailablePrivilegeTokens != 3 {
		t.Fatal("privilege tokens were not returned to the public supply")
	}
	if state.Players[0].Gems[models.GemBlue] != 1 || state.Players[0].Gems[models.GemRed] != 1 {
		t.Fatal("selected gems were not added to the player")
	}
	if state.GemBoard[0][0] != "" || state.GemBoard[1][1] != "" {
		t.Fatal("selected gems remain on the board")
	}
}

func TestRuleBoundarySpendPrivilegeIsAtomic(t *testing.T) {
	for _, tc := range []struct {
		name      string
		count     int
		positions []models.BoardPosition
	}{
		{"zero_count", 0, nil},
		{"too_many", 4, gemPositions([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3})},
		{"count_mismatch", 2, gemPositions([2]int{0, 0})},
		{"out_of_bounds", 1, gemPositions([2]int{5, 0})},
		{"duplicate_position", 2, gemPositions([2]int{0, 0}, [2]int{0, 0})},
		{"empty_position_after_valid", 2, gemPositions([2]int{0, 0}, [2]int{0, 1})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			state.Players[0].PrivilegeTokens = 4
			state.GemBoard[0][0] = models.GemBlue
			before, _ := json.Marshal(state)

			if err := gl.SpendPrivilege("p1", tc.count, tc.positions); err == nil {
				t.Fatal("invalid privilege action was accepted")
			}
			after, _ := json.Marshal(state)
			if !reflect.DeepEqual(before, after) {
				t.Fatal("rejected privilege action changed game state")
			}
		})
	}
}

func TestReserveCardValidatesBeforeTakingGold(t *testing.T) {
	for _, tc := range []struct {
		name   string
		cardID string
	}{
		{"unknown_face_up_card", "missing"},
		{"invalid_deck_level", "deck_level_9"},
		{"empty_deck", "deck_level_1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			state.GemBoard[0][0] = models.GemGold
			before, _ := json.Marshal(state)
			if err := gl.ReserveCard("p1", models.ReserveSelection{CardID: tc.cardID, GoldPosition: models.BoardPosition{X: 0, Y: 0}}); err == nil {
				t.Fatal("invalid reservation was accepted")
			}
			after, _ := json.Marshal(state)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected reservation changed game state")
			}
		})
	}
}

func TestRegressionReserveFaceUpCard(t *testing.T) {
	gl, state := regressionGame()
	state.GemBoard[0][0] = models.GemGold
	state.FlippedCards[models.Level1] = []string{"card-1"}
	if err := gl.ReserveCard("p1", models.ReserveSelection{CardID: "card-1", GoldPosition: models.BoardPosition{X: 0, Y: 0}}); err != nil {
		t.Fatal(err)
	}
	if state.Players[0].Gems[models.GemGold] != 1 || !reflect.DeepEqual(state.Players[0].ReservedCards, []string{"card-1"}) {
		t.Fatal("valid reservation did not grant gold and reserve the card")
	}
}

func TestPaymentPlanRequiresExactColorsAndIntegers(t *testing.T) {
	gl, state := regressionGame()
	player := &state.Players[0]
	player.Gems = map[models.GemType]int{models.GemBlue: 2, models.GemRed: 2, models.GemGold: 2}
	required := map[models.GemType]int{models.GemBlue: 2}
	for _, tc := range []struct {
		name string
		plan models.PaymentPlan
		want bool
	}{
		{"matching_color", models.PaymentPlan{models.GemBlue: 2, models.GemGold: 0}, true},
		{"gold_substitution", models.PaymentPlan{models.GemBlue: 1, models.GemGold: 1}, true},
		{"wrong_color", models.PaymentPlan{models.GemRed: 2}, false},
		{"negative", models.PaymentPlan{models.GemBlue: -1, models.GemGold: 3}, false},
		{"unknown_type", models.PaymentPlan{models.GemType("ruby"): 0, models.GemBlue: 2}, false},
		{"too_much_color", models.PaymentPlan{models.GemBlue: 2, models.GemGold: 1}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := gl.validatePaymentPlan(player, tc.plan, required); got != tc.want {
				t.Fatalf("validatePaymentPlan() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPurchaseRejectsInvalidEffectsAtomically(t *testing.T) {
	gl, state := regressionGame()
	card := models.DevelopmentCard{ID: "extra", Level: models.Level1, Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}, Cost: map[models.GemType]int{}}
	state.CardMap[card.ID], state.CardDetails[card.ID] = card, card
	state.FlippedCards[models.Level1] = []string{card.ID}
	state.GemBoard[0][0] = models.GemBlue
	before, _ := json.Marshal(state)
	data := models.PurchaseSelection{CardID: card.ID, PaymentPlan: models.PaymentPlan{}, Effects: &models.PurchaseEffects{ExtraToken: &models.PurchaseExtraToken{SelectedGem: &models.BoardPosition{X: -1, Y: 0}}}}
	if err := gl.BuyCardWithPaymentPlanAndEffects("p1", data); err == nil {
		t.Fatal("purchase with invalid effect data was accepted")
	}
	after, _ := json.Marshal(state)
	if !bytes.Equal(before, after) {
		t.Fatal("rejected purchase changed game state")
	}
}

func TestPurchaseEffectRuleMatrix(t *testing.T) {
	tests := []struct {
		name    string
		card    models.DevelopmentCard
		prepare func(*models.GameState)
		effects map[string]any
		wantErr bool
	}{
		{
			name:    "extra_token_selects_matching_board_target",
			card:    models.DevelopmentCard{Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}},
			prepare: func(state *models.GameState) { state.GemBoard[2][3] = models.GemBlue },
			effects: map[string]any{"extraToken": map[string]any{"selectedGem": map[string]any{"x": float64(2), "y": float64(3)}}},
		},
		{
			name:    "extra_token_skips_only_without_target",
			card:    models.DevelopmentCard{Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}},
			effects: map[string]any{"extraToken": map[string]any{"skipped": true}},
		},
		{
			name:    "extra_token_cannot_skip_existing_target",
			card:    models.DevelopmentCard{Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}},
			prepare: func(state *models.GameState) { state.GemBoard[4][1] = models.GemBlue },
			effects: map[string]any{"extraToken": map[string]any{"skipped": true}},
			wantErr: true,
		},
		{
			name:    "extra_token_rejects_wrong_color",
			card:    models.DevelopmentCard{Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}},
			prepare: func(state *models.GameState) { state.GemBoard[1][2] = models.GemRed },
			effects: map[string]any{"extraToken": map[string]any{"selectedGem": map[string]any{"x": float64(1), "y": float64(2)}}},
			wantErr: true,
		},
		{
			name:    "steal_selects_token_owned_by_opponent",
			card:    models.DevelopmentCard{Color: models.GemRed, Bonus: models.GemRed, Effects: []models.CardEffect{models.Steal}},
			prepare: func(state *models.GameState) { state.Players[1].Gems[models.GemPearl] = 1 },
			effects: map[string]any{"steal": map[string]any{"gemType": "pearl"}},
		},
		{
			name:    "steal_skips_only_without_target",
			card:    models.DevelopmentCard{Color: models.GemRed, Bonus: models.GemRed, Effects: []models.CardEffect{models.Steal}},
			effects: map[string]any{"steal": map[string]any{"skipped": true}},
		},
		{
			name:    "steal_cannot_skip_existing_target",
			card:    models.DevelopmentCard{Color: models.GemRed, Bonus: models.GemRed, Effects: []models.CardEffect{models.Steal}},
			prepare: func(state *models.GameState) { state.Players[1].Gems[models.GemGreen] = 1 },
			effects: map[string]any{"steal": map[string]any{"skipped": true}},
			wantErr: true,
		},
		{
			name:    "steal_rejects_unowned_token",
			card:    models.DevelopmentCard{Color: models.GemRed, Bonus: models.GemRed, Effects: []models.CardEffect{models.Steal}},
			effects: map[string]any{"steal": map[string]any{"gemType": "green"}},
			wantErr: true,
		},
		{
			name:    "wildcard_accepts_normal_color",
			card:    models.DevelopmentCard{Color: models.GemGray, Bonus: models.GemGray, Effects: []models.CardEffect{models.Wildcard}},
			effects: map[string]any{"wildcard": map[string]any{"color": "white"}},
		},
		{
			name:    "wildcard_rejects_illegal_color",
			card:    models.DevelopmentCard{Color: models.GemGray, Bonus: models.GemGray, Effects: []models.CardEffect{models.Wildcard}},
			effects: map[string]any{"wildcard": map[string]any{"color": "gold"}},
			wantErr: true,
		},
		{
			name:    "noble_accepts_available_threshold_choice",
			card:    models.DevelopmentCard{Color: models.GemWhite, Bonus: models.GemWhite, Crowns: 1},
			prepare: func(state *models.GameState) { state.Players[0].Crowns = 2; state.AvailableNobles = []string{"noble2"} },
			effects: map[string]any{"noble": map[string]any{"id": "noble2"}},
		},
		{
			name:    "noble_rejects_unavailable_choice",
			card:    models.DevelopmentCard{Color: models.GemWhite, Bonus: models.GemWhite, Crowns: 1},
			prepare: func(state *models.GameState) { state.Players[0].Crowns = 2; state.AvailableNobles = []string{"noble2"} },
			effects: map[string]any{"noble": map[string]any{"id": "noble4"}},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			tc.card.ID, tc.card.Level, tc.card.Cost = "matrix-card", models.Level1, map[models.GemType]int{}
			state.CardMap[tc.card.ID], state.CardDetails[tc.card.ID] = tc.card, tc.card
			state.FlippedCards[models.Level1] = []string{tc.card.ID}
			if tc.prepare != nil {
				tc.prepare(state)
			}
			before, _ := json.Marshal(state)
			err := gl.BuyCardWithPaymentPlanAndEffects("p1", purchaseSelection(tc.card.ID, tc.effects))
			if tc.wantErr {
				if err == nil {
					t.Fatal("invalid effect choice was accepted")
				}
				after, _ := json.Marshal(state)
				if !bytes.Equal(before, after) {
					t.Fatal("rejected purchase changed state")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if !containsString(state.Players[0].DevelopmentCards, tc.card.ID) {
				t.Fatal("purchase was not completed")
			}
		})
	}
}

func TestPurchaseEffectsOmissionRemainsLegacyCompatible(t *testing.T) {
	for _, tc := range []struct {
		name           string
		includeEffects bool
	}{
		{name: "entire_effects_field_omitted"},
		{name: "effect_entry_omitted_from_empty_object", includeEffects: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			card := models.DevelopmentCard{ID: "legacy-extra", Level: models.Level1, Color: models.GemBlue, Bonus: models.GemBlue, Effects: []models.CardEffect{models.ExtraToken}, Cost: map[models.GemType]int{}}
			state.CardMap[card.ID], state.CardDetails[card.ID] = card, card
			state.FlippedCards[models.Level1] = []string{card.ID}
			state.GemBoard[0][0] = models.GemBlue
			data := models.PurchaseSelection{CardID: card.ID, PaymentPlan: models.PaymentPlan{}}
			if tc.includeEffects {
				data.Effects = &models.PurchaseEffects{}
			}
			if err := gl.BuyCardWithPaymentPlanAndEffects("p1", data); err != nil {
				t.Fatal(err)
			}
			if state.GemBoard[0][0] != models.GemBlue {
				t.Fatal("omission unexpectedly executed the effect")
			}
		})
	}
}

func TestNobleSelectionRequiresAvailabilityAndCrowns(t *testing.T) {
	gl, state := regressionGame()
	state.AvailableNobles = []string{"noble1"}
	card := models.DevelopmentCard{Crowns: 1}
	plan := func(id string) *models.PurchaseEffects {
		return &models.PurchaseEffects{Noble: &models.PurchaseNoble{ID: id}}
	}
	if err := gl.validatePurchaseEffects(&state.Players[0], &card, plan("noble1")); err == nil {
		t.Fatal("noble was allowed below the first crown threshold")
	}
	state.Players[0].Crowns = 2
	if err := gl.validatePurchaseEffects(&state.Players[0], &card, plan("noble1")); err != nil {
		t.Fatal(err)
	}
	if err := gl.validatePurchaseEffects(&state.Players[0], &card, plan("noble2")); err == nil {
		t.Fatal("unavailable noble was accepted")
	}
	state.Players[0].Nobles = []string{"noble4"}
	state.Players[0].Crowns = 4
	if err := gl.validatePurchaseEffects(&state.Players[0], &card, plan("noble1")); err == nil {
		t.Fatal("second noble was allowed below six crowns")
	}
}

func TestPurchaseRequiresVisibleOrOwnReservedCard(t *testing.T) {
	for _, tc := range []struct {
		name             string
		opponentReserved bool
	}{
		{"hidden_deck_card", false},
		{"opponent_reserved_card", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			card := models.DevelopmentCard{ID: "hidden", Level: models.Level1, Bonus: models.GemBlue, Cost: map[models.GemType]int{}}
			state.CardMap[card.ID], state.CardDetails[card.ID] = card, card
			if tc.opponentReserved {
				state.Players[1].ReservedCards = []string{card.ID}
			} else {
				state.Level1Deck = []string{card.ID}
			}
			before, _ := json.Marshal(state)
			if err := gl.BuyCardWithPaymentPlanAndEffects("p1", purchaseSelection(card.ID, nil)); err == nil {
				t.Fatal("unavailable card was purchased")
			}
			after, _ := json.Marshal(state)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected card purchase changed state")
			}
		})
	}
}

func TestRegressionPurchaseVisibleAndOwnReservedCards(t *testing.T) {
	for _, source := range []string{"visible", "reserved"} {
		t.Run(source, func(t *testing.T) {
			gl, state := regressionGame()
			card := models.DevelopmentCard{ID: source, Level: models.Level1, Bonus: models.GemBlue, Cost: map[models.GemType]int{}}
			state.CardMap[card.ID], state.CardDetails[card.ID] = card, card
			if source == "visible" {
				state.FlippedCards[models.Level1] = []string{card.ID}
			} else {
				state.Players[0].ReservedCards = []string{card.ID}
			}
			if err := gl.BuyCardWithPaymentPlanAndEffects("p1", purchaseSelection(card.ID, nil)); err != nil {
				t.Fatal(err)
			}
			if !containsString(state.Players[0].DevelopmentCards, card.ID) || state.Players[0].Bonus[models.GemBlue] != 1 {
				t.Fatal("valid purchase did not grant the card")
			}
		})
	}
}

func TestDiscardBatchMustReachExactTargetAtomically(t *testing.T) {
	for _, tc := range []struct {
		name     string
		discards map[models.GemType]int
	}{
		{"too_few", map[models.GemType]int{models.GemBlue: 1}},
		{"too_many", map[models.GemType]int{models.GemBlue: 3}},
		{"unknown_type", map[models.GemType]int{models.GemType("ruby"): 2}},
		{"zero_count", map[models.GemType]int{models.GemBlue: 0}},
		{"negative_count", map[models.GemType]int{models.GemBlue: -1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, state := regressionGame()
			state.NeedsGemDiscard = true
			state.GemDiscardPlayerID = "p1"
			state.Players[0].Gems[models.GemBlue] = 12
			before, _ := json.Marshal(state)
			if err := gl.DiscardGemsBatch("p1", tc.discards); err == nil {
				t.Fatal("invalid discard batch was accepted")
			}
			after, _ := json.Marshal(state)
			if !bytes.Equal(before, after) {
				t.Fatal("rejected discard batch changed state")
			}
		})
	}
}
