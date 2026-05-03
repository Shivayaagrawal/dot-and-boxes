import type { Box } from "@/types/websocket";

export type ClaimEdgeName =
  | "top_edge"
  | "left_edge"
  | "right_edge"
  | "bottom_edge";

function cloneGrid(grid: Box[][]): Box[][] {
  return grid.map((row) => row.map((b) => ({ ...b })));
}

export function isEdgeFree(
  grid: Box[][],
  boardSize: number,
  row: number,
  col: number,
  edge: string,
): boolean {
  if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) {
    return false;
  }
  const box = grid[row][col];
  if (!box) return false;
  switch (edge as ClaimEdgeName) {
    case "top_edge":
      return !box.top_edge;
    case "bottom_edge":
      return !box.bottom_edge;
    case "left_edge":
      return !box.left_edge;
    case "right_edge":
      return !box.right_edge;
    default:
      return false;
  }
}

/** Mirror server edge toggles on both adjacent cells (same as Go `setEdge`). */
export function applyClaimEdge(
  grid: Box[][],
  boardSize: number,
  row: number,
  col: number,
  edge: string,
): Box[][] {
  const g = cloneGrid(grid);
  const set = (
    r: number,
    c: number,
    k: keyof Pick<Box, ClaimEdgeName>,
  ): void => {
    if (r < 0 || r >= boardSize || c < 0 || c >= boardSize) return;
    g[r][c][k] = true;
  };
  switch (edge as ClaimEdgeName) {
    case "top_edge":
      set(row, col, "top_edge");
      set(row - 1, col, "bottom_edge");
      break;
    case "bottom_edge":
      set(row, col, "bottom_edge");
      set(row + 1, col, "top_edge");
      break;
    case "left_edge":
      set(row, col, "left_edge");
      set(row, col - 1, "right_edge");
      break;
    case "right_edge":
      set(row, col, "right_edge");
      set(row, col + 1, "left_edge");
      break;
    default:
      break;
  }
  return g;
}
