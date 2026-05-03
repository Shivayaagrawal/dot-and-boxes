import { Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import type { Box } from "@/types/websocket";

export type EdgeKind = "top_edge" | "left_edge" | "right_edge" | "bottom_edge";

const NEUTRAL_ACTIVE = 0xe5e7eb;
const HOVER_INACTIVE = 0x9ca3af;
/** Unclaimed edges — slightly darker than grid so reads as “wood pencil” lines */
const INACTIVE = 0xb8b8b8;
/** Hovered, claimable edge on your turn — deep slate, darker than pastels but not harsh black */
const SELECTABLE_DARK = 0x57534e;
/** Claimed edge before any neighbouring box is completed (human or bot) */
const CLAIMED_PENDING = SELECTABLE_DARK;
/** Full lattice guide lines (dots & boxes intersections) */
const GRID_LINE = 0xd4d4d4;
/** Pastel quadrants — tabletop title-screen style */
const QUAD_TL = 0xf2c4c4;
const QUAD_TR = 0xb8daf5;
const QUAD_BL = 0xc4ebd4;
const QUAD_BR = 0xf5eab8;
const DOT_FILL = 0xffffff;
/** White dots (reference UI uses circles on line intersections) */
const DOT_RADIUS = 4.5;
const EDGE_THICK = 6;
const EDGE_HIT = 22;

export function cssColorToPixi(css: string): number {
  const s = css.trim().toLowerCase();
  if (s === "gray" || s === "grey") return 0xe5e7eb;
  if (!s.startsWith("#")) return pastelNamedColor(s);
  let h = s.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return parseInt(h, 16);
}

/** Pastel “wood stain” fills per player color token */
function pastelNamedColor(name: string): number {
  switch (name) {
    case "red":
      return 0xf2a4a4;
    case "blue":
      return 0xa8d4f0;
    case "green":
      return 0xb8e6c8;
    case "purple":
      return 0xd4c4f5;
    case "orange":
      return 0xffd4a8;
    case "pink":
      return 0xffc8dd;
    default:
      return 0xd6d3d1;
  }
}

function strokeForActiveEdge(userColor: string): number {
  const c = userColor.trim().toLowerCase();
  if (c === "gray" || c === "grey") return NEUTRAL_ACTIVE;
  return cssColorToPixi(userColor);
}

function darkenFill(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const dr = Math.max(0, Math.floor(r * (1 - amount)));
  const dg = Math.max(0, Math.floor(g * (1 - amount)));
  const db = Math.max(0, Math.floor(b * (1 - amount)));
  return (dr << 16) | (dg << 8) | db;
}

function addWoodGrainOverlay(g: Graphics, x: number, y: number, w: number, h: number, base: number): void {
  const grain = darkenFill(base, 0.14);
  for (let yy = y + 3; yy < y + h - 2; yy += 5) {
    g.rect(x + 2, yy, w - 4, 2).fill({ color: grain, alpha: 0.4 });
  }
}

/** Four pastel “tabletop” panels with subtle horizontal grain + pan hit target */
function addTabletopQuadrantBackground(
  parent: Container,
  baseX: number,
  baseY: number,
  fullW: number,
  fullH: number,
  onPointerDown: (e: FederatedPointerEvent) => void,
): void {
  const bg = new Graphics();
  const hw = fullW / 2;
  const hh = fullH / 2;

  bg.rect(baseX, baseY, hw, hh).fill({ color: QUAD_TL });
  addWoodGrainOverlay(bg, baseX, baseY, hw, hh, QUAD_TL);

  bg.rect(baseX + hw, baseY, hw, hh).fill({ color: QUAD_TR });
  addWoodGrainOverlay(bg, baseX + hw, baseY, hw, hh, QUAD_TR);

  bg.rect(baseX, baseY + hh, hw, hh).fill({ color: QUAD_BL });
  addWoodGrainOverlay(bg, baseX, baseY + hh, hw, hh, QUAD_BL);

  bg.rect(baseX + hw, baseY + hh, hw, hh).fill({ color: QUAD_BR });
  addWoodGrainOverlay(bg, baseX + hw, baseY + hh, hw, hh, QUAD_BR);

  bg.eventMode = "static";
  bg.cursor = "grab";
  bg.on("pointerdown", onPointerDown);
  parent.addChild(bg);
}

/** Thin grey lines through dot centers (full lattice behind edges). */
function addGridLatticeLines(parent: Container, boardDim: number, boxSize: number): void {
  const g = new Graphics();
  g.eventMode = "none";
  const span = boardDim * boxSize;
  const stroke = { width: 1.25, color: GRID_LINE, alpha: 0.95 };

  for (let r = 0; r <= boardDim; r++) {
    const y = r * boxSize;
    g.moveTo(0, y).lineTo(span, y).stroke(stroke);
  }
  for (let c = 0; c <= boardDim; c++) {
    const x = c * boxSize;
    g.moveTo(x, 0).lineTo(x, span).stroke(stroke);
  }
  parent.addChild(g);
}

function addDotLattice(
  parent: Container,
  boardDim: number,
  boxSize: number,
): void {
  const g = new Graphics();
  g.eventMode = "none";
  for (let r = 0; r <= boardDim; r++) {
    for (let c = 0; c <= boardDim; c++) {
      const cx = c * boxSize;
      const cy = r * boxSize;
      g.circle(cx, cy, DOT_RADIUS + 0.75).fill({ color: 0x000000, alpha: 0.12 });
      g.circle(cx, cy, DOT_RADIUS).fill({ color: DOT_FILL });
      g.circle(cx, cy, DOT_RADIUS).stroke({ width: 1, color: 0xe5e5e5, alpha: 0.85 });
    }
  }
  parent.addChild(g);
}

function addCompletedCell(
  parent: Container,
  x: number,
  y: number,
  boxSize: number,
  fillColor: number,
): void {
  const g = new Graphics();
  const pad = 3;
  const inner = boxSize - pad * 2;
  const x0 = Math.round(x + pad);
  const y0 = Math.round(y + pad);

  g.rect(x0, y0, inner, inner).fill({ color: fillColor });
  g.rect(x0, y0, inner, inner).stroke({ width: 2, color: 0x3f3f46, alpha: 0.35 });

  const grain = darkenFill(fillColor, 0.18);
  for (let yy = y0 + 2; yy < y0 + inner - 2; yy += 4) {
    g.rect(x0 + 1, yy, inner - 2, 2).fill({ color: grain, alpha: 0.45 });
  }

  g.eventMode = "none";
  parent.addChild(g);

  const cx = x + boxSize / 2;
  const cy = y + boxSize / 2;
  const score = new Text({
    text: "+1",
    style: {
      fill: 0x1c1917,
      fontSize: Math.min(22, boxSize * 0.34),
      fontFamily: '"Press Start 2P", monospace',
      fontWeight: "400",
    },
  });
  score.anchor.set(0.5);
  score.position.set(cx, cy);
  score.alpha = 0.88;
  score.eventMode = "none";
  parent.addChild(score);
}

/** How to draw a claimed line: neutral grey until an adjacent box scores, then player tint. */
type ClaimedPaint =
  | { kind: "pending" }
  | { kind: "player"; colorStr: string };

function adjacentCellsForEdge(
  row: number,
  col: number,
  edge: EdgeKind,
  dim: number,
): Array<{ row: number; col: number }> {
  switch (edge) {
    case "top_edge":
      return [
        { row, col },
        ...(row > 0 ? [{ row: row - 1, col }] : []),
      ];
    case "bottom_edge":
      return [
        { row, col },
        ...(row < dim - 1 ? [{ row: row + 1, col }] : []),
      ];
    case "left_edge":
      return [
        { row, col },
        ...(col > 0 ? [{ row, col: col - 1 }] : []),
      ];
    case "right_edge":
      return [
        { row, col },
        ...(col < dim - 1 ? [{ row, col: col + 1 }] : []),
      ];
    default:
      return [{ row, col }];
  }
}

function claimedPaintForEdge(
  boxes: Box[],
  dim: number,
  row: number,
  col: number,
  edge: EdgeKind,
  turnToUserIdMap: Record<number, number>,
  userColors: Record<number, string>,
): ClaimedPaint {
  for (const { row: r, col: c } of adjacentCellsForEdge(row, col, edge, dim)) {
    const b = boxes.find((x) => x.row === r && x.col === c);
    if (b?.owner_turn != null) {
      const uid = turnToUserIdMap[b.owner_turn];
      const colorStr = uid ? userColors[uid] ?? "gray" : "gray";
      return { kind: "player", colorStr };
    }
  }
  return { kind: "pending" };
}

function addPixelEdge(
  parent: Container,
  xa: number,
  ya: number,
  xb: number,
  yb: number,
  claimedPaint: ClaimedPaint | null,
  emphasizeSelectable: boolean,
  onActivateClick: () => void,
): void {
  const claimed = claimedPaint !== null;

  const c = new Container();
  parent.addChild(c);

  const horizontal = ya === yb;
  const xMin = Math.min(xa, xb);
  const xMax = Math.max(xa, xb);
  const yMin = Math.min(ya, yb);
  const yMax = Math.max(ya, yb);
  const length = horizontal ? xMax - xMin : yMax - yMin;

  let hitX: number;
  let hitY: number;
  let hitW: number;
  let hitH: number;
  if (horizontal) {
    hitX = xMin - EDGE_HIT / 2;
    hitY = ya - EDGE_HIT / 2;
    hitW = length + EDGE_HIT;
    hitH = EDGE_HIT;
  } else {
    hitX = xa - EDGE_HIT / 2;
    hitY = yMin - EDGE_HIT / 2;
    hitW = EDGE_HIT;
    hitH = length + EDGE_HIT;
  }

  const visuals = new Container();
  c.addChild(visuals);

  const hit = new Graphics();
  hit.rect(hitX, hitY, hitW, hitH).fill({ color: 0xffffff, alpha: 0.001 });
  hit.eventMode = "static";
  hit.cursor = claimed ? "default" : "pointer";

  let hover = false;

  const paint = () => {
    visuals.removeChildren();

    /** Recomputed each paint so thickness tracks hover. */
    const thick = claimed
      ? EDGE_THICK
      : emphasizeSelectable && hover
        ? EDGE_THICK + 8
        : EDGE_THICK;

    let strokeColor: number;
    if (!claimed) {
      strokeColor =
        emphasizeSelectable && hover
          ? SELECTABLE_DARK
          : !emphasizeSelectable && hover
            ? HOVER_INACTIVE
            : INACTIVE;
    } else if (claimedPaint!.kind === "pending") {
      strokeColor = CLAIMED_PENDING;
    } else {
      strokeColor = strokeForActiveEdge(claimedPaint!.colorStr);
    }

    const playerStroke =
      claimed && claimedPaint!.kind === "player"
        ? strokeForActiveEdge(claimedPaint!.colorStr)
        : NEUTRAL_ACTIVE;
    const neutralActive = claimed && claimedPaint!.kind === "player" && playerStroke === NEUTRAL_ACTIVE;
    const glowInner = neutralActive ? 0xfbbf24 : playerStroke;
    const glowOuter = neutralActive ? 0xf59e0b : playerStroke;

    if (horizontal) {
      const yTop = Math.round(ya - thick / 2);
      if (claimed && claimedPaint!.kind === "player") {
        const o = new Graphics();
        o.rect(xMin - 1, yTop - 2, length + 2, thick + 4).fill({
          color: glowOuter,
          alpha: neutralActive ? 0.35 : 0.28,
        });
        o.eventMode = "none";
        visuals.addChild(o);
        const i = new Graphics();
        i.rect(xMin, yTop - 1, length, thick + 2).fill({
          color: glowInner,
          alpha: neutralActive ? 0.55 : 0.42,
        });
        i.eventMode = "none";
        visuals.addChild(i);
      }
      if (!claimed && emphasizeSelectable && hover) {
        const rim = new Graphics();
        rim
          .rect(xMin - 2, yTop - 2, length + 4, thick + 4)
          .stroke({ width: 1.5, color: 0xa8a29e, alpha: 0.55 });
        rim.eventMode = "none";
        visuals.addChild(rim);
      }
      const main = new Graphics();
      main.rect(xMin, yTop, length, thick).fill({ color: strokeColor });
      main.eventMode = "none";
      visuals.addChild(main);
    } else {
      const xLeft = Math.round(xa - thick / 2);
      if (claimed && claimedPaint!.kind === "player") {
        const o = new Graphics();
        o.rect(xLeft - 2, yMin - 1, thick + 4, length + 2).fill({
          color: glowOuter,
          alpha: neutralActive ? 0.35 : 0.28,
        });
        o.eventMode = "none";
        visuals.addChild(o);
        const i = new Graphics();
        i.rect(xLeft - 1, yMin, thick + 2, length).fill({
          color: glowInner,
          alpha: neutralActive ? 0.55 : 0.42,
        });
        i.eventMode = "none";
        visuals.addChild(i);
      }
      if (!claimed && emphasizeSelectable && hover) {
        const rim = new Graphics();
        rim
          .rect(xLeft - 2, yMin - 2, thick + 4, length + 4)
          .stroke({ width: 1.5, color: 0xa8a29e, alpha: 0.55 });
        rim.eventMode = "none";
        visuals.addChild(rim);
      }
      const main = new Graphics();
      main.rect(xLeft, yMin, thick, length).fill({ color: strokeColor });
      main.eventMode = "none";
      visuals.addChild(main);
    }
  };

  c.addChild(hit);

  if (!claimed) {
    hit.on("pointertap", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      onActivateClick();
    });
    hit.on("pointerover", () => {
      hover = true;
      paint();
    });
    hit.on("pointerout", () => {
      hover = false;
      paint();
    });
  }

  paint();
}

export function rebuildBoardContent(
  content: Container,
  params: {
    boxes: Box[];
    /** Square grid dimension (same as `board_size` from server). */
    boardDimension: number;
    boxSize: number;
    baseX: number;
    baseY: number;
    fullW: number;
    fullH: number;
    userColors: Record<number, string>;
    turnToUserIdMap: Record<number, number>;
    gameID: number;
    userID: number;
    onEdgeClick: (
      gameID: number,
      userID: number,
      row: number,
      col: number,
      edge: EdgeKind,
    ) => void;
    onPanPointerDown: (e: FederatedPointerEvent) => void;
    /** When true, unclaimed edges render thicker/brighter (your turn). */
    emphasizeSelectableEdges?: boolean;
  },
): void {
  const removed = content.removeChildren();
  for (const ch of removed) {
    ch.destroy({ children: true, texture: true, textureSource: true });
  }

  addTabletopQuadrantBackground(
    content,
    params.baseX,
    params.baseY,
    params.fullW,
    params.fullH,
    params.onPanPointerDown,
  );

  addGridLatticeLines(content, params.boardDimension, params.boxSize);

  const boxSize = params.boxSize;

  for (const box of params.boxes) {
    if (box.owner_turn === null) continue;
    const ownerId = params.turnToUserIdMap[box.owner_turn];
    const colorStr = ownerId
      ? params.userColors[ownerId] ?? "#888888"
      : "#888888";
    const x = box.col * boxSize;
    const y = box.row * boxSize;
    const fill =
      colorStr.startsWith("#") || colorStr.length > 6
        ? cssColorToPixi(colorStr)
        : pastelNamedColor(colorStr.trim().toLowerCase());
    addCompletedCell(content, x, y, boxSize, fill);
  }

  for (const box of params.boxes) {
    const { row, col, top_edge, left_edge, right_edge, bottom_edge } = box;
    const x = col * boxSize;
    const y = row * boxSize;

    const emit = (edge: EdgeKind) => {
      params.onEdgeClick(params.gameID, params.userID, row, col, edge);
    };

    const sel = params.emphasizeSelectableEdges ?? false;
    const dim = params.boardDimension;
    const maps = params.turnToUserIdMap;
    const colors = params.userColors;
    const boxes = params.boxes;

    addPixelEdge(
      content,
      x,
      y,
      x + boxSize,
      y,
      top_edge
        ? claimedPaintForEdge(boxes, dim, row, col, "top_edge", maps, colors)
        : null,
      sel && !top_edge,
      () => emit("top_edge"),
    );
    addPixelEdge(
      content,
      x,
      y,
      x,
      y + boxSize,
      left_edge
        ? claimedPaintForEdge(boxes, dim, row, col, "left_edge", maps, colors)
        : null,
      sel && !left_edge,
      () => emit("left_edge"),
    );
    addPixelEdge(
      content,
      x + boxSize,
      y,
      x + boxSize,
      y + boxSize,
      right_edge
        ? claimedPaintForEdge(boxes, dim, row, col, "right_edge", maps, colors)
        : null,
      sel && !right_edge,
      () => emit("right_edge"),
    );
    addPixelEdge(
      content,
      x,
      y + boxSize,
      x + boxSize,
      y + boxSize,
      bottom_edge
        ? claimedPaintForEdge(boxes, dim, row, col, "bottom_edge", maps, colors)
        : null,
      sel && !bottom_edge,
      () => emit("bottom_edge"),
    );
  }

  addDotLattice(content, params.boardDimension, boxSize);
}
