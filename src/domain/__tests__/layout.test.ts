import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  canvasRect,
  insetRect,
  anchorPoint,
  anchoredRect,
  gridCells,
  stackItems,
  type Rect,
  type Anchor,
} from "../layout";

// -- Helpers --
const arbRect = fc.record({
  x: fc.integer({ min: 0, max: 1000 }),
  y: fc.integer({ min: 0, max: 1000 }),
  width: fc.integer({ min: 1, max: 1000 }),
  height: fc.integer({ min: 1, max: 1000 }),
});

const arbHorizontal = fc.constantFrom("left", "center", "right") as fc.Arbitrary<
  "left" | "center" | "right"
>;
const arbVertical = fc.constantFrom("top", "center", "bottom") as fc.Arbitrary<
  "top" | "center" | "bottom"
>;

describe("canvasRect", () => {
  it("creates a rect at origin with given dimensions", () => {
    const r = canvasRect(800, 600);
    expect(r).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("property: always starts at (0,0)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        (w, h) => {
          const r = canvasRect(w, h);
          expect(r.x).toBe(0);
          expect(r.y).toBe(0);
          expect(r.width).toBe(w);
          expect(r.height).toBe(h);
        }
      )
    );
  });
});

describe("insetRect", () => {
  it("shrinks a rect by the given padding", () => {
    const r = canvasRect(800, 600);
    const result = insetRect(r, { top: 80, bottom: 40, left: 40, right: 40 });
    expect(result).toEqual({ x: 40, y: 80, width: 720, height: 480 });
  });

  it("handles partial insets (only top+left)", () => {
    const r = canvasRect(400, 300);
    const result = insetRect(r, { top: 10, left: 20 });
    expect(result).toEqual({ x: 20, y: 10, width: 380, height: 290 });
  });

  it("handles empty inset (identity)", () => {
    const r = { x: 50, y: 50, width: 200, height: 100 };
    const result = insetRect(r, {});
    expect(result).toEqual(r);
  });

  it("clamps to zero dimensions when inset exceeds rect", () => {
    const r = canvasRect(100, 100);
    const result = insetRect(r, { top: 60, bottom: 60, left: 60, right: 60 });
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
  });

  it("property: result dimensions are non-negative", () => {
    fc.assert(
      fc.property(
        arbRect,
        fc.record({
          top: fc.integer({ min: 0, max: 500 }),
          bottom: fc.integer({ min: 0, max: 500 }),
          left: fc.integer({ min: 0, max: 500 }),
          right: fc.integer({ min: 0, max: 500 }),
        }),
        (rect, inset) => {
          const result = insetRect(rect, inset);
          expect(result.width).toBeGreaterThanOrEqual(0);
          expect(result.height).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });

  it("property: result is contained within parent when inset fits", () => {
    fc.assert(
      fc.property(
        arbRect,
        (rect) => {
          // Generate inset that fits within the rect
          const maxH = Math.floor(rect.width / 2);
          const maxV = Math.floor(rect.height / 2);
          const left = Math.floor(Math.random() * maxH);
          const right = Math.floor(Math.random() * (maxH - left));
          const top = Math.floor(Math.random() * maxV);
          const bottom = Math.floor(Math.random() * (maxV - top));
          const result = insetRect(rect, { top, bottom, left, right });
          expect(result.x).toBeGreaterThanOrEqual(rect.x);
          expect(result.y).toBeGreaterThanOrEqual(rect.y);
          expect(result.x + result.width).toBeLessThanOrEqual(
            rect.x + rect.width
          );
          expect(result.y + result.height).toBeLessThanOrEqual(
            rect.y + rect.height
          );
        }
      )
    );
  });
});

describe("anchorPoint", () => {
  const rect: Rect = { x: 100, y: 200, width: 400, height: 300 };

  it("resolves top-left", () => {
    const p = anchorPoint(rect, { horizontal: "left", vertical: "top" });
    expect(p).toEqual({ x: 100, y: 200 });
  });

  it("resolves top-center", () => {
    const p = anchorPoint(rect, { horizontal: "center", vertical: "top" });
    expect(p).toEqual({ x: 300, y: 200 });
  });

  it("resolves top-right", () => {
    const p = anchorPoint(rect, { horizontal: "right", vertical: "top" });
    expect(p).toEqual({ x: 500, y: 200 });
  });

  it("resolves center-left", () => {
    const p = anchorPoint(rect, { horizontal: "left", vertical: "center" });
    expect(p).toEqual({ x: 100, y: 350 });
  });

  it("resolves center-center", () => {
    const p = anchorPoint(rect, { horizontal: "center", vertical: "center" });
    expect(p).toEqual({ x: 300, y: 350 });
  });

  it("resolves center-right", () => {
    const p = anchorPoint(rect, { horizontal: "right", vertical: "center" });
    expect(p).toEqual({ x: 500, y: 350 });
  });

  it("resolves bottom-left", () => {
    const p = anchorPoint(rect, { horizontal: "left", vertical: "bottom" });
    expect(p).toEqual({ x: 100, y: 500 });
  });

  it("resolves bottom-center", () => {
    const p = anchorPoint(rect, { horizontal: "center", vertical: "bottom" });
    expect(p).toEqual({ x: 300, y: 500 });
  });

  it("resolves bottom-right", () => {
    const p = anchorPoint(rect, { horizontal: "right", vertical: "bottom" });
    expect(p).toEqual({ x: 500, y: 500 });
  });

  it("applies offset to anchor point", () => {
    const p = anchorPoint(rect, {
      horizontal: "right",
      vertical: "bottom",
      offsetX: -10,
      offsetY: -20,
    });
    expect(p).toEqual({ x: 490, y: 480 });
  });

  it("property: zero-offset anchor always within parent", () => {
    fc.assert(
      fc.property(arbRect, arbHorizontal, arbVertical, (rect, h, v) => {
        const p = anchorPoint(rect, { horizontal: h, vertical: v });
        expect(p.x).toBeGreaterThanOrEqual(rect.x);
        expect(p.x).toBeLessThanOrEqual(rect.x + rect.width);
        expect(p.y).toBeGreaterThanOrEqual(rect.y);
        expect(p.y).toBeLessThanOrEqual(rect.y + rect.height);
      })
    );
  });
});

describe("anchoredRect", () => {
  const parent: Rect = { x: 0, y: 0, width: 800, height: 600 };

  it("positions a rect centered on top-left anchor", () => {
    const r = anchoredRect(
      parent,
      { horizontal: "left", vertical: "top" },
      100,
      50
    );
    // Centered on (0,0): x = -50, y = -25
    expect(r).toEqual({ x: -50, y: -25, width: 100, height: 50 });
  });

  it("positions a rect centered on center anchor", () => {
    const r = anchoredRect(
      parent,
      { horizontal: "center", vertical: "center" },
      200,
      100
    );
    // Centered on (400,300): x = 300, y = 250
    expect(r).toEqual({ x: 300, y: 250, width: 200, height: 100 });
  });

  it("positions a rect centered on bottom-right anchor", () => {
    const r = anchoredRect(
      parent,
      { horizontal: "right", vertical: "bottom" },
      100,
      50
    );
    // Centered on (800,600): x = 750, y = 575
    expect(r).toEqual({ x: 750, y: 575, width: 100, height: 50 });
  });

  it("applies offsets", () => {
    const r = anchoredRect(
      parent,
      { horizontal: "center", vertical: "bottom", offsetY: -20 },
      760,
      30
    );
    // Anchor = (400, 580), centered: x = 400-380=20, y = 580-15=565
    expect(r).toEqual({ x: 20, y: 565, width: 760, height: 30 });
  });
});

describe("gridCells", () => {
  it("produces correct number of cells", () => {
    const rect: Rect = { x: 60, y: 150, width: 720, height: 400 };
    const cells = gridCells(rect, { cols: 8, cellWidth: 90, cellHeight: 100 }, 16);
    expect(cells).toHaveLength(16);
  });

  it("first cell is offset by half cell from rect origin", () => {
    const rect: Rect = { x: 60, y: 150, width: 720, height: 400 };
    const cells = gridCells(rect, { cols: 8, cellWidth: 90, cellHeight: 100 }, 1);
    expect(cells[0].col).toBe(0);
    expect(cells[0].row).toBe(0);
    expect(cells[0].x).toBe(60 + 45); // rect.x + cellWidth/2
    expect(cells[0].y).toBe(150 + 50); // rect.y + cellHeight/2
  });

  it("cells advance by cellWidth/cellHeight", () => {
    const rect: Rect = { x: 0, y: 0, width: 800, height: 600 };
    const cells = gridCells(rect, { cols: 3, cellWidth: 100, cellHeight: 80 }, 6);
    // Row 0: cols 0,1,2
    expect(cells[0]).toEqual({ x: 50, y: 40, width: 100, height: 80, col: 0, row: 0 });
    expect(cells[1]).toEqual({ x: 150, y: 40, width: 100, height: 80, col: 1, row: 0 });
    expect(cells[2]).toEqual({ x: 250, y: 40, width: 100, height: 80, col: 2, row: 0 });
    // Row 1: cols 0,1,2
    expect(cells[3]).toEqual({ x: 50, y: 120, width: 100, height: 80, col: 0, row: 1 });
    expect(cells[4]).toEqual({ x: 150, y: 120, width: 100, height: 80, col: 1, row: 1 });
    expect(cells[5]).toEqual({ x: 250, y: 120, width: 100, height: 80, col: 2, row: 1 });
  });

  it("zero count produces empty array", () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(gridCells(rect, { cols: 4, cellWidth: 25, cellHeight: 25 }, 0)).toEqual([]);
  });

  it("property: cell count matches input", () => {
    fc.assert(
      fc.property(
        arbRect,
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 0, max: 50 }),
        (rect, cols, count) => {
          const cells = gridCells(
            rect,
            { cols, cellWidth: 50, cellHeight: 50 },
            count
          );
          expect(cells).toHaveLength(count);
        }
      )
    );
  });
});

describe("stackItems", () => {
  it("produces items spaced by itemHeight + spacing", () => {
    const rect: Rect = { x: 0, y: 100, width: 400, height: 300 };
    const items = stackItems(rect, { itemHeight: 56 }, 3);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ x: 200, y: 128, index: 0 }); // center-aligned, y = rect.y + itemHeight/2
    expect(items[1]).toEqual({ x: 200, y: 184, index: 1 }); // + 56
    expect(items[2]).toEqual({ x: 200, y: 240, index: 2 }); // + 56
  });

  it("left-aligned items use rect.x", () => {
    const rect: Rect = { x: 50, y: 100, width: 300, height: 400 };
    const items = stackItems(rect, { itemHeight: 40, align: "left" }, 2);
    expect(items[0].x).toBe(50);
    expect(items[1].x).toBe(50);
  });

  it("right-aligned items use rect.x + rect.width", () => {
    const rect: Rect = { x: 50, y: 100, width: 300, height: 400 };
    const items = stackItems(rect, { itemHeight: 40, align: "right" }, 2);
    expect(items[0].x).toBe(350);
    expect(items[1].x).toBe(350);
  });

  it("applies spacing between items", () => {
    const rect: Rect = { x: 0, y: 0, width: 200, height: 400 };
    const items = stackItems(rect, { itemHeight: 40, spacing: 10 }, 3);
    expect(items[0].y).toBe(20); // 0 + 40/2
    expect(items[1].y).toBe(70); // 20 + 40 + 10
    expect(items[2].y).toBe(120); // 70 + 40 + 10
  });

  it("zero count produces empty array", () => {
    const rect: Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(stackItems(rect, { itemHeight: 20 }, 0)).toEqual([]);
  });

  it("property: item count matches input", () => {
    fc.assert(
      fc.property(
        arbRect,
        fc.integer({ min: 0, max: 30 }),
        (rect, count) => {
          const items = stackItems(rect, { itemHeight: 30 }, count);
          expect(items).toHaveLength(count);
        }
      )
    );
  });
});
