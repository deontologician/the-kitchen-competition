import { describe, it, expect } from "vitest";
import {
  canvas,
  gameplayPanel,
  timerBar,
  skipButtonPos,
  coinHudPos,
  groceryGridRegion,
  groceryGrid,
  recipeRegion,
  recipeStack,
  kitchenInvRegion,
  tableRegion,
  tablePositions,
  sidebarAnchor,
  hintRegion,
  notificationPos,
  menuStack,
} from "../../view/scene-layout";
import type { Rect, Point } from "../../layout";

const isWithin = (p: Point, r: Rect): boolean =>
  p.x >= r.x &&
  p.x <= r.x + r.width &&
  p.y >= r.y &&
  p.y <= r.y + r.height;

const rectWithin = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

describe("scene-layout", () => {
  describe("root regions", () => {
    it("canvas is 800x600 at origin", () => {
      expect(canvas).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    });

    it("gameplayPanel is within canvas", () => {
      expect(rectWithin(gameplayPanel, canvas)).toBe(true);
    });

    it("gameplayPanel matches panel spec margins", () => {
      expect(gameplayPanel).toEqual({ x: 40, y: 80, width: 720, height: 480 });
    });
  });

  describe("timer bar", () => {
    it("is within canvas", () => {
      expect(rectWithin(timerBar, canvas)).toBe(true);
    });
  });

  describe("skipButtonPos", () => {
    it("is inside gameplay panel", () => {
      expect(isWithin(skipButtonPos, gameplayPanel)).toBe(true);
    });

    it("is near bottom-right of panel", () => {
      expect(skipButtonPos.x).toBe(690);
      expect(skipButtonPos.y).toBe(535);
    });
  });

  describe("coinHudPos", () => {
    it("is within canvas", () => {
      expect(isWithin(coinHudPos, canvas)).toBe(true);
    });

    it("is near top-right", () => {
      expect(coinHudPos.x).toBe(780);
      expect(coinHudPos.y).toBe(20);
    });
  });

  describe("grocery grid", () => {
    it("grocery grid region is within gameplay panel", () => {
      expect(rectWithin(groceryGridRegion, gameplayPanel)).toBe(true);
    });

    it("produces correct cell count", () => {
      expect(groceryGrid(16)).toHaveLength(16);
      expect(groceryGrid(0)).toHaveLength(0);
    });

    it("first cell matches old GRID_LEFT/TOP + half cell", () => {
      const cells = groceryGrid(1);
      expect(cells[0].x).toBe(60 + 45); // GRID_LEFT + CELL_W/2
      expect(cells[0].y).toBe(150 + 50); // GRID_TOP + CELL_H/2
    });
  });

  describe("kitchen recipe region", () => {
    it("recipe region is within gameplay panel", () => {
      expect(rectWithin(recipeRegion, gameplayPanel)).toBe(true);
    });

    it("recipe region starts at expected position", () => {
      expect(recipeRegion.x).toBe(50);
      expect(recipeRegion.y).toBe(140);
      expect(recipeRegion.width).toBe(340);
    });

    it("recipe stack produces correct items", () => {
      const items = recipeStack(7);
      expect(items).toHaveLength(7);
      expect(items[0].x).toBe(50); // left-aligned
      expect(items[0].y).toBe(140 + 28); // region.y + itemHeight/2
    });
  });

  describe("kitchen inventory region", () => {
    it("is within gameplay panel", () => {
      expect(rectWithin(kitchenInvRegion, gameplayPanel)).toBe(true);
    });

    it("starts at expected position", () => {
      expect(kitchenInvRegion.x).toBe(430);
      expect(kitchenInvRegion.y).toBe(140);
    });
  });

  describe("restaurant tables", () => {
    it("table region is within canvas", () => {
      expect(rectWithin(tableRegion, canvas)).toBe(true);
    });

    it("produces 6 table positions matching old TABLE_POSITIONS", () => {
      const tables = tablePositions(6);
      expect(tables).toHaveLength(6);
      // Row 0
      expect(tables[0].x).toBe(180);
      expect(tables[0].y).toBe(290);
      expect(tables[1].x).toBe(400);
      expect(tables[1].y).toBe(290);
      expect(tables[2].x).toBe(620);
      expect(tables[2].y).toBe(290);
      // Row 1
      expect(tables[3].x).toBe(180);
      expect(tables[3].y).toBe(460);
      expect(tables[4].x).toBe(400);
      expect(tables[4].y).toBe(460);
      expect(tables[5].x).toBe(620);
      expect(tables[5].y).toBe(460);
    });
  });

  describe("sidebar", () => {
    it("sidebar anchor is within canvas", () => {
      expect(isWithin(sidebarAnchor, canvas)).toBe(true);
    });

    it("sidebar anchor matches old position", () => {
      expect(sidebarAnchor.x).toBe(770);
      expect(sidebarAnchor.y).toBe(90);
    });
  });

  describe("hint region", () => {
    it("is within canvas", () => {
      expect(rectWithin(hintRegion, canvas)).toBe(true);
    });
  });

  describe("notification", () => {
    it("notification pos is within canvas", () => {
      expect(isWithin(notificationPos, canvas)).toBe(true);
    });

    it("is at bottom-center", () => {
      expect(notificationPos.x).toBe(400);
      expect(notificationPos.y).toBe(570);
    });
  });

  describe("menu stack", () => {
    it("produces centered items", () => {
      const items = menuStack(360, 3);
      expect(items).toHaveLength(3);
      expect(items[0].x).toBe(400); // center of 800
    });

    it("items are spaced with 40px height + 10px spacing", () => {
      const items = menuStack(360, 3);
      expect(items[1].y - items[0].y).toBe(50); // 40 + 10
    });
  });
});
