package game

import "testing"

// Regression: a line can close a box whose *neighbor* had 3 sides, while the
// cell we attach the move to has fewer than 3 — the old classifier missed these.
func TestChooseBotMoveCompletesViaNeighborNotLocalThreeEdges(t *testing.T) {
	u0, u1 := 0, 1
	players := []Player{
		{UserID: &u0, Username: "H", TurnOrder: 0, Score: 0},
		{UserID: &u1, Username: "B", TurnOrder: 1, Score: 0},
	}
	g := NewGame(nil, 2, players)

	// Close all of (0,1) except its left side (shared with (0,0)).
	for _, m := range []Move{
		{TurnOrder: 0, Row: 0, Col: 1, Edge: TopEdge},
		{TurnOrder: 1, Row: 0, Col: 1, Edge: RightEdge},
		{TurnOrder: 0, Row: 0, Col: 1, Edge: BottomEdge},
	} {
		if _, err := g.ApplyMove(m); err != nil {
			t.Fatalf("setup move: %v", err)
		}
	}

	// Box (0,0) has only its bottom edge; playing Right on (0,0) completes (0,1).
	mv := chooseBotMove(g, g.CurrentTurn)
	if mv == nil {
		t.Fatal("expected a move")
	}
	if mv.Row != 0 || mv.Col != 0 || mv.Edge != RightEdge {
		t.Fatalf("expected RightEdge at (0,0) to take the box, got %+v", mv)
	}
}

// Same board + same seat → softmax uses same RNG seed twice → identical pick (reproducible).
// Different bot seats use different profiles/temperatures and may choose different edges on purpose.
func TestChooseBotMoveReproducibleSameSeat(t *testing.T) {
	u0, u1, u2 := 0, -1, -2
	players := []Player{
		{UserID: &u0, Username: "H", TurnOrder: 0, Score: 0},
		{UserID: &u1, Username: "B1", TurnOrder: 1, Score: 0},
		{UserID: &u2, Username: "B2", TurnOrder: 2, Score: 0},
	}
	g := NewGame(nil, 3, players)
	for _, m := range []Move{
		{TurnOrder: 0, Row: 1, Col: 1, Edge: TopEdge},
		{TurnOrder: 1, Row: 1, Col: 1, Edge: RightEdge},
	} {
		if _, err := g.ApplyMove(m); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}
	if g.CurrentTurn != 2 {
		t.Fatalf("expected current turn 2, got %d", g.CurrentTurn)
	}
	a := chooseBotMove(g, 2)
	b := chooseBotMove(g, 2)
	if a == nil || b == nil {
		t.Fatal("expected moves")
	}
	if a.Row != b.Row || a.Col != b.Col || a.Edge != b.Edge {
		t.Fatalf("inconsistent choice on identical state: %+v vs %+v", a, b)
	}
}
