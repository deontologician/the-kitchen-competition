import {
  canvasRect,
  insetRect,
  anchorPoint,
  anchoredRect,
  gridCells,
  stackItems,
  type Rect,
  type Point,
  type GridCell,
  type StackItem,
} from "../layout";

// ── Root regions ──

/** Full 800x600 canvas. */
export const canvas: Rect = canvasRect(800, 600);

/** Shared gameplay panel (all 3 gameplay scenes). */
export const gameplayPanel: Rect = {
  x: 40,
  y: 80,
  width: 720,
  height: 480,
};

// ── Timer bar (shared across grocery, kitchen, restaurant) ──

export const timerBar: Rect = { x: 100, y: 50, width: 600, height: 24 };

// ── Scene title ──

export const sceneTitleY = 110;
export const restaurantTitleY = 120;

// ── Skip/action button — bottom-right of panel ──

export const skipButtonPos: Point = anchorPoint(gameplayPanel, {
  horizontal: "right",
  vertical: "bottom",
  offsetX: -70,
  offsetY: -25,
});

// ── Coin HUD — top-right of canvas ──

export const coinHudPos: Point = anchorPoint(canvas, {
  horizontal: "right",
  vertical: "top",
  offsetX: -20,
  offsetY: 20,
});

// ── Grocery grid ──

export const groceryGridRegion: Rect = insetRect(gameplayPanel, {
  top: 70,
  left: 20,
  right: 20,
  bottom: 10,
});

export const GROCERY_COLS = 8;
export const GROCERY_CELL_W = 90;
export const GROCERY_CELL_H = 100;
export const GROCERY_ICON_SIZE = 48;

export const groceryGrid = (count: number): ReadonlyArray<GridCell> =>
  gridCells(
    groceryGridRegion,
    { cols: GROCERY_COLS, cellWidth: GROCERY_CELL_W, cellHeight: GROCERY_CELL_H },
    count
  );

// ── Kitchen recipe list — left column of panel ──

export const recipeRegion: Rect = insetRect(gameplayPanel, {
  top: 60,
  left: 10,
  right: 370,
  bottom: 10,
});

export const RECIPE_ROW_H = 56;
export const RECIPE_ICON_SIZE = 36;

export const recipeStack = (count: number): ReadonlyArray<StackItem> =>
  stackItems(recipeRegion, { itemHeight: RECIPE_ROW_H, align: "left" }, count);

// ── Kitchen inventory — right column of panel ──

export const kitchenInvRegion: Rect = insetRect(gameplayPanel, {
  top: 60,
  left: 390,
  right: 10,
  bottom: 10,
});

export const KITCHEN_INV_COL_W = 90;
export const KITCHEN_INV_ROW_H = 30;

// ── Restaurant tables (2x3 grid) ──

export const tableRegion: Rect = insetRect(canvas, {
  top: 205,
  left: 70,
  right: 70,
  bottom: 55,
});

export const TABLE_SIZE = 140;
export const TABLE_CELL_W = 220;
export const TABLE_CELL_H = 170;

export const tablePositions = (count: number): ReadonlyArray<GridCell> =>
  gridCells(
    tableRegion,
    { cols: 3, cellWidth: TABLE_CELL_W, cellHeight: TABLE_CELL_H },
    count
  );

// ── Inventory sidebar — right side of screen ──

export const sidebarAnchor: Point = anchorPoint(canvas, {
  horizontal: "right",
  vertical: "top",
  offsetX: -30,
  offsetY: 90,
});

// ── Tutorial hint — bottom area of panel ──

export const hintY = 500;
export const hintRegion: Rect = {
  x: 60,
  y: hintY - 14,
  width: canvas.width - 120,
  height: 30,
};

// ── Notification — bottom-center of canvas ──

export const notificationPos: Point = anchorPoint(canvas, {
  horizontal: "center",
  vertical: "bottom",
  offsetY: -30,
});

// ── Kitchen zone layout (prep + service modes) ──

/**
 * Left strip: pending orders list (service mode only).
 * x≈10, w≈150
 */
export const serviceOrdersRegion: Rect = { x: 10, y: 90, width: 150, height: 470 };

/**
 * Center panel: zone panels (prep + service modes).
 * x≈170, w≈400
 */
export const serviceZoneRegion: Rect = { x: 170, y: 90, width: 400, height: 470 };

/**
 * Right strip: tappable ingredients / pantry (prep + service modes).
 * x≈580, w≈210
 */
export const servicePantryRegion: Rect = { x: 580, y: 90, width: 210, height: 470 };

/**
 * Bottom of zone region: ready pile display.
 */
export const serviceReadyRegion: Rect = { x: 170, y: 470, width: 400, height: 90 };

/** Height of a single zone panel. */
export const ZONE_PANEL_H = 90;

/** Vertical gap between zone panels. */
export const ZONE_PANEL_GAP = 8;

// ── Menu stacks (Title, Pause, LoadGame scenes) ──

export const menuStack = (
  startY: number,
  count: number
): ReadonlyArray<StackItem> =>
  stackItems(
    { x: 0, y: startY, width: canvas.width, height: canvas.height - startY },
    { itemHeight: 40, spacing: 10, align: "center" },
    count
  );
