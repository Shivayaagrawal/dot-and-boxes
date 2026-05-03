package game

import (
	"cmp"
	"fmt"
	"math"
	"math/rand"
	"slices"
)

// BotProfile holds base weights and exploration knobs (temperature/noise are scaled by grid size).
type BotProfile struct {
	CaptureWeight float64
	RiskWeight    float64
	ChainWeight   float64
	Temperature   float64
	Noise         float64
}

// Bot seats (-1 aggressive, -2 defensive, -3 balanced): stochastic greedy with distinct personalities.
var botSeatProfiles = map[int]BotProfile{
	-1: {CaptureWeight: 3.0, RiskWeight: 1.2, ChainWeight: 2.0, Temperature: 0.08, Noise: 0.03},
	-2: {CaptureWeight: 2.2, RiskWeight: 2.5, ChainWeight: 1.5, Temperature: 0.05, Noise: 0.02},
	-3: {CaptureWeight: 2.5, RiskWeight: 1.8, ChainWeight: 1.8, Temperature: 0.10, Noise: 0.04},
}

var defaultBotProfile = BotProfile{
	CaptureWeight: 2.5, RiskWeight: 1.8, ChainWeight: 1.8, Temperature: 0.10, Noise: 0.04,
}

func botProfileForTurn(g *Game, turnOrder int) BotProfile {
	if turnOrder < 0 || turnOrder >= len(g.Players) {
		return defaultBotProfile
	}
	uid := g.Players[turnOrder].UserID
	if uid == nil || *uid >= 0 {
		return defaultBotProfile
	}
	if p, ok := botSeatProfiles[*uid]; ok {
		return p
	}
	return defaultBotProfile
}

// newBotRNG returns a dedicated RNG stream for this bot ply (not package rand).
// Seed mixes game identity, seat, and aggregate version so shuffle/noise/softmax advance
// deterministically for a fixed board state (tests) while differing across games and plies.
func newBotRNG(g *Game, turnOrder int) *rand.Rand {
	var seed int64
	if g.GameID != nil {
		seed ^= int64(*g.GameID) * 1000003
	}
	seed ^= g.CreatedAt.UnixNano()
	if turnOrder >= 0 && turnOrder < len(g.Players) && g.Players[turnOrder].UserID != nil {
		seed ^= int64(*g.Players[turnOrder].UserID) * 40013
	}
	seed ^= int64(g.Version()) * 7919
	return rand.New(rand.NewSource(seed))
}

func gridScale(g *Game) float64 {
	n := g.BoardSize
	total := float64(n * n)
	if total <= 0 {
		return 1
	}
	s := math.Sqrt(total)
	if s < 1 {
		return 1
	}
	return s
}

func completedBoxCount(g *Game) int {
	n := g.BoardSize
	cnt := 0
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if g.Grid[r][c].OwnerTurn != nil {
				cnt++
			}
		}
	}
	return cnt
}

// evaluateMoveScore scores a candidate using local features; weights scale continuously with game progress.
func evaluateMoveScore(g *Game, m Move, prof BotProfile, rng *rand.Rand, noiseAmp float64, turnOrder int) float64 {
	totalBoxes := g.BoardSize * g.BoardSize
	if totalBoxes == 0 {
		totalBoxes = 1
	}
	progress := float64(completedBoxCount(g)) / float64(totalBoxes)

	captureW := prof.CaptureWeight * (1.0 + 0.5*progress)
	riskW := prof.RiskWeight * (1.0 + 1.5*progress)
	chainW := prof.ChainWeight * (1.0 + 2.0*progress)

	captures := countNewCompletions(g, m)
	createsThirdSide := countUnclaimedBoxesWithThreeEdges(g, m)
	chainLen := estimateOpponentChain(g, m, turnOrder)

	score := float64(captures)*captureW -
		float64(createsThirdSide)*riskW -
		float64(chainLen)*chainW +
		rng.Float64()*noiseAmp

	if captures > 0 {
		score += 100
	}
	return score
}

// softmaxPick samples one move; higher scores are more likely.
// Weights use exp((score - maxScore) / T) so values stay bounded and comparable across grid sizes.
func softmaxPick(rng *rand.Rand, moves []Move, scores []float64, temperature float64) Move {
	if len(moves) == 0 {
		return Move{}
	}
	if len(moves) == 1 {
		return moves[0]
	}
	maxS := scores[0]
	for _, s := range scores[1:] {
		if s > maxS {
			maxS = s
		}
	}
	var sum float64
	weights := make([]float64, len(scores))
	for i, s := range scores {
		ex := (s - maxS) / temperature
		if ex > 700 {
			ex = 700
		}
		w := math.Exp(ex)
		weights[i] = w
		sum += w
	}
	if sum <= 0 || math.IsNaN(sum) || math.IsInf(sum, 0) {
		return moves[0]
	}
	r := rng.Float64() * sum
	for i, w := range weights {
		r -= w
		if r <= 0 {
			return moves[i]
		}
	}
	return moves[len(moves)-1]
}

func edgeTypeRank(e EdgeType) int {
	switch e {
	case TopEdge:
		return 0
	case RightEdge:
		return 1
	case BottomEdge:
		return 2
	case LeftEdge:
		return 3
	default:
		return 99
	}
}

func moveLess(a, b Move) bool {
	if a.Row != b.Row {
		return a.Row < b.Row
	}
	if a.Col != b.Col {
		return a.Col < b.Col
	}
	return edgeTypeRank(a.Edge) < edgeTypeRank(b.Edge)
}

// physicalEdgeKey identifies one undirected grid segment so Top/Bottom and Left/Right
// mirror encodings map to the same key (duplicate candidates used to tie-break differently).
func physicalEdgeKey(boardSize, row, col int, e EdgeType) string {
	switch e {
	case TopEdge:
		if row == 0 {
			return fmt.Sprintf("t%d", col)
		}
		return fmt.Sprintf("v%d,%d", row-1, col)
	case BottomEdge:
		if row == boardSize-1 {
			return fmt.Sprintf("b%d", col)
		}
		return fmt.Sprintf("v%d,%d", row, col)
	case LeftEdge:
		if col == 0 {
			return fmt.Sprintf("l%d", row)
		}
		return fmt.Sprintf("h%d,%d", row, col-1)
	case RightEdge:
		if col == boardSize-1 {
			return fmt.Sprintf("r%d", row)
		}
		return fmt.Sprintf("h%d,%d", row, col)
	default:
		return fmt.Sprintf("?%d,%d,%s", row, col, e)
	}
}

func duplicateEdgeGrid(grid [][]Box, n int) [][]Box {
	dst := make([][]Box, n)
	for r := 0; r < n; r++ {
		dst[r] = make([]Box, n)
		for c := 0; c < n; c++ {
			dst[r][c] = grid[r][c]
		}
	}
	return dst
}

// isEdgeAvailableSim mirrors Game.isEdgeAvailable for a simulated edge grid.
func isEdgeAvailableSim(grid [][]Box, boardSize, row, col int, edge EdgeType) bool {
	if row < 0 || row >= boardSize || col < 0 || col >= boardSize {
		return false
	}
	box := &grid[row][col]
	switch edge {
	case TopEdge:
		return !box.TopEdge
	case RightEdge:
		return !box.RightEdge
	case BottomEdge:
		return !box.BottomEdge
	case LeftEdge:
		return !box.LeftEdge
	default:
		return false
	}
}

func duplicateSimGrid(sim [][]Box, n int) [][]Box {
	dst := make([][]Box, n)
	for r := 0; r < n; r++ {
		dst[r] = make([]Box, n)
		copy(dst[r], sim[r])
	}
	return dst
}

// countNewCompletionsFromSim counts boxes newly completed from sim’s unowned cells after placing an edge.
func countNewCompletionsFromSim(g *Game, sim [][]Box, row, col int, edge EdgeType) int {
	n := g.BoardSize
	grid := duplicateSimGrid(sim, n)
	applyEdgeToSimGrid(grid, n, row, col, edge)
	cnt := 0
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if sim[r][c].OwnerTurn != nil {
				continue
			}
			b := grid[r][c]
			if b.TopEdge && b.RightEdge && b.BottomEdge && b.LeftEdge {
				cnt++
			}
		}
	}
	return cnt
}

func assignOwnersForCompletedBoxes(sim [][]Box, n int, ownerTurn int) {
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if sim[r][c].OwnerTurn != nil {
				continue
			}
			b := sim[r][c]
			if b.TopEdge && b.RightEdge && b.BottomEdge && b.LeftEdge {
				o := ownerTurn
				sim[r][c].OwnerTurn = &o
			}
		}
	}
}

// estimateOpponentChain sums boxes captured by opponents in a greedy multi-step chain after our move,
// respecting turn order (capturing player keeps the turn).
func estimateOpponentChain(g *Game, move Move, botTurn int) int {
	n := g.BoardSize
	sim := cloneEdgeGrid(g)
	applyEdgeToSimGrid(sim, n, move.Row, move.Col, move.Edge)

	caps := countNewCompletions(g, move)
	assignOwnersForCompletedBoxes(sim, n, botTurn)

	np := len(g.Players)
	if np == 0 {
		return 0
	}
	current := botTurn
	if caps == 0 {
		current = (current + 1) % np
	}

	oppBoxes := 0
	maxIter := n*n*8 + 64

	for iter := 0; iter < maxIter; iter++ {
		bestN := 0
		var bestM Move
		for row := 0; row < n; row++ {
			for col := 0; col < n; col++ {
				for _, edge := range []EdgeType{TopEdge, RightEdge, BottomEdge, LeftEdge} {
					if !isEdgeAvailableSim(sim, n, row, col, edge) {
						continue
					}
					nc := countNewCompletionsFromSim(g, sim, row, col, edge)
					if nc > bestN {
						bestN = nc
						bestM = Move{TurnOrder: botTurn, Row: row, Col: col, Edge: edge}
					}
				}
			}
		}
		if bestN == 0 {
			break
		}

		if current != botTurn {
			oppBoxes += bestN
		}

		applyEdgeToSimGrid(sim, n, bestM.Row, bestM.Col, bestM.Edge)
		assignOwnersForCompletedBoxes(sim, n, current)

		// Capturing player keeps the turn (standard Dots & Boxes rule).
	}
	return oppBoxes
}

func dedupeMovesByPhysicalEdge(boardSize int, moves []Move) []Move {
	best := make(map[string]Move, len(moves))
	for _, m := range moves {
		k := physicalEdgeKey(boardSize, m.Row, m.Col, m.Edge)
		existing, ok := best[k]
		if !ok || moveLess(m, existing) {
			mc := m
			best[k] = mc
		}
	}
	out := make([]Move, 0, len(best))
	for _, m := range best {
		out = append(out, m)
	}
	sortMoves(out)
	return out
}

// cloneEdgeGrid copies the grid geometry and ownership pointers (read-only in simulation).
func cloneEdgeGrid(g *Game) [][]Box {
	n := g.BoardSize
	dst := make([][]Box, n)
	for r := 0; r < n; r++ {
		dst[r] = make([]Box, n)
		for c := 0; c < n; c++ {
			src := g.Grid[r][c]
			dst[r][c] = Box{
				Row:        r,
				Col:        c,
				TopEdge:    src.TopEdge,
				RightEdge:  src.RightEdge,
				BottomEdge: src.BottomEdge,
				LeftEdge:   src.LeftEdge,
				OwnerTurn:  src.OwnerTurn,
			}
		}
	}
	return dst
}

func applyEdgeToSimGrid(grid [][]Box, n int, row, col int, edge EdgeType) {
	box := &grid[row][col]

	switch edge {
	case TopEdge:
		box.TopEdge = true
		if row > 0 {
			grid[row-1][col].BottomEdge = true
		}
	case RightEdge:
		box.RightEdge = true
		if col < n-1 {
			grid[row][col+1].LeftEdge = true
		}
	case BottomEdge:
		box.BottomEdge = true
		if row < n-1 {
			grid[row+1][col].TopEdge = true
		}
	case LeftEdge:
		box.LeftEdge = true
		if col > 0 {
			grid[row][col-1].RightEdge = true
		}
	}
}

func countEdgesSim(box *Box) int {
	n := 0
	if box.TopEdge {
		n++
	}
	if box.RightEdge {
		n++
	}
	if box.BottomEdge {
		n++
	}
	if box.LeftEdge {
		n++
	}
	return n
}

// countNewCompletions returns how many still-unclaimed boxes become fully closed after the move.
func countNewCompletions(g *Game, move Move) int {
	grid := cloneEdgeGrid(g)
	n := g.BoardSize
	applyEdgeToSimGrid(grid, n, move.Row, move.Col, move.Edge)

	cnt := 0
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if g.Grid[r][c].OwnerTurn != nil {
				continue
			}
			b := grid[r][c]
			if b.TopEdge && b.RightEdge && b.BottomEdge && b.LeftEdge {
				cnt++
			}
		}
	}
	return cnt
}

// countUnclaimedBoxesWithThreeEdges after hypothetically playing move (gift boxes for opponent).
func countUnclaimedBoxesWithThreeEdges(g *Game, move Move) int {
	grid := cloneEdgeGrid(g)
	n := g.BoardSize
	applyEdgeToSimGrid(grid, n, move.Row, move.Col, move.Edge)

	cnt := 0
	for r := 0; r < n; r++ {
		for c := 0; c < n; c++ {
			if g.Grid[r][c].OwnerTurn != nil {
				continue
			}
			if countEdgesSim(&grid[r][c]) == 3 {
				cnt++
			}
		}
	}
	return cnt
}

// collectAllLegalMoves lists every available edge once per cell encoding; callers should
// dedupe with dedupeMovesByPhysicalEdge so Bot1/Bot2/Bot3 score the same geometric move set.
func collectAllLegalMoves(g *Game, turnOrder int) []Move {
	var moves []Move
	for row := 0; row < g.BoardSize; row++ {
		for col := 0; col < g.BoardSize; col++ {
			for _, edge := range []EdgeType{TopEdge, RightEdge, BottomEdge, LeftEdge} {
				if !g.isEdgeAvailable(row, col, edge) {
					continue
				}
				moves = append(moves, Move{
					TurnOrder: turnOrder,
					Row:       row,
					Col:       col,
					Edge:      edge,
				})
			}
		}
	}
	sortMoves(moves)
	return moves
}

func sortMoves(moves []Move) {
	slices.SortFunc(moves, func(a, b Move) int {
		if c := cmp.Compare(a.Row, b.Row); c != 0 {
			return c
		}
		if c := cmp.Compare(a.Col, b.Col); c != 0 {
			return c
		}
		return cmp.Compare(edgeTypeRank(a.Edge), edgeTypeRank(b.Edge))
	})
}

// chooseBotMove evaluates unclaimed edges with a grid-aware scorer, shuffles to avoid coordinate bias,
// adds bounded noise, always prioritizes capturing moves (pool filter + score bonus), and picks via softmax.
func chooseBotMove(g *Game, turnOrder int) *Move {
	candidates := dedupeMovesByPhysicalEdge(g.BoardSize, collectAllLegalMoves(g, turnOrder))
	if len(candidates) == 0 {
		return nil
	}

	prof := botProfileForTurn(g, turnOrder)
	scale := gridScale(g)
	temp := prof.Temperature / scale
	noiseAmp := prof.Noise / scale
	if temp < 1e-6 {
		temp = 1e-6
	}

	rng := newBotRNG(g, turnOrder)
	rng.Shuffle(len(candidates), func(i, j int) {
		candidates[i], candidates[j] = candidates[j], candidates[i]
	})

	maxCap := 0
	for _, m := range candidates {
		if c := countNewCompletions(g, m); c > maxCap {
			maxCap = c
		}
	}

	pool := candidates
	if maxCap > 0 {
		filtered := make([]Move, 0)
		for _, m := range candidates {
			if countNewCompletions(g, m) == maxCap {
				filtered = append(filtered, m)
			}
		}
		pool = filtered
	}
	if len(pool) == 0 {
		return nil
	}

	scores := make([]float64, len(pool))
	for i, m := range pool {
		scores[i] = evaluateMoveScore(g, m, prof, rng, noiseAmp, turnOrder)
	}
	chosen := softmaxPick(rng, pool, scores, temp)
	return &chosen
}
