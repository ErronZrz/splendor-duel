package game

import (
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

func gemPositions(points ...[2]int) []map[string]any {
	positions := make([]map[string]any, 0, len(points))
	for _, p := range points {
		// JSON numbers arrive as float64 in the existing protocol.
		positions = append(positions, map[string]any{"x": float64(p[0]), "y": float64(p[1])})
	}
	return positions
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
		position map[string]any
	}{
		{"missing_coordinate", map[string]any{"x": float64(0)}},
		{"string_coordinate", map[string]any{"x": "0", "y": float64(0)}},
		{"negative_coordinate", map[string]any{"x": float64(-1), "y": float64(0)}},
		{"out_of_bounds", map[string]any{"x": float64(5), "y": float64(0)}},
		{"fractional_coordinate", map[string]any{"x": 0.5, "y": float64(0)}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gl, s := regressionGame()
			s.GemBoard[0][0] = models.GemBlue
			before, _ := json.Marshal(s)
			if err := gl.TakeGems("p1", []map[string]any{tc.position}); err == nil {
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
		positions []map[string]any
	}{
		{"zero_count", 0, nil},
		{"too_many", 4, gemPositions([2]int{0, 0}, [2]int{0, 1}, [2]int{0, 2}, [2]int{0, 3})},
		{"count_mismatch", 2, gemPositions([2]int{0, 0})},
		{"missing_coordinate", 1, []map[string]any{{"x": float64(0)}}},
		{"fractional_coordinate", 1, []map[string]any{{"x": 0.5, "y": float64(0)}}},
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
