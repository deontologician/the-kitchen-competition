import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  findItem,
  rawItems,
  preppedItems,
  dishItems,
  allItems,
} from "../items";
import type { ItemDef } from "../items";
import { itemId } from "../branded";

// ---------------------------------------------------------------------------
// allItems — basic invariants
// ---------------------------------------------------------------------------
describe("allItems", () => {
  it("returns 74 items total", () => {
    expect(allItems().length).toBe(74);
  });

  it("every item has a non-empty id and name", () => {
    allItems().forEach((item) => {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.name.length).toBeGreaterThan(0);
    });
  });

  it("all ids are unique", () => {
    const ids = allItems().map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every item has a valid category", () => {
    const validCategories = ["raw", "prepped", "dish"] as const;
    allItems().forEach((item) => {
      expect(validCategories).toContain(item.category);
    });
  });
});

// ---------------------------------------------------------------------------
// Category breakdown
// ---------------------------------------------------------------------------
describe("category counts", () => {
  it("has 28 raw ingredients", () => {
    expect(rawItems().length).toBe(28);
  });

  it("has 31 prepped/cooked intermediates", () => {
    expect(preppedItems().length).toBe(31);
  });

  it("has 15 dishes", () => {
    expect(dishItems().length).toBe(15);
  });

  it("category sublists sum to allItems", () => {
    expect(rawItems().length + preppedItems().length + dishItems().length).toBe(
      allItems().length
    );
  });
});

// ---------------------------------------------------------------------------
// rawItems — cost rules
// ---------------------------------------------------------------------------
describe("rawItems", () => {
  it("every raw item has a defined cost", () => {
    rawItems().forEach((item) => {
      expect(item.cost).toBeDefined();
      expect(item.cost).toBeGreaterThan(0);
    });
  });

  it("every raw item has category 'raw'", () => {
    rawItems().forEach((item) => {
      expect(item.category).toBe("raw");
    });
  });

  it("raw item costs are between 1 and 3", () => {
    rawItems().forEach((item) => {
      expect(item.cost).toBeGreaterThanOrEqual(1);
      expect(item.cost).toBeLessThanOrEqual(3);
    });
  });

  it("raw items never expire (shelfLifeMs is undefined)", () => {
    rawItems().forEach((item) => {
      expect(item.shelfLifeMs).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// preppedItems — shelf life rules
// ---------------------------------------------------------------------------
describe("preppedItems", () => {
  it("every prepped item has no cost", () => {
    preppedItems().forEach((item) => {
      expect(item.cost).toBeUndefined();
    });
  });

  it("every prepped item has category 'prepped'", () => {
    preppedItems().forEach((item) => {
      expect(item.category).toBe("prepped");
    });
  });

  it("every prepped item has a defined shelf life", () => {
    preppedItems().forEach((item) => {
      expect(item.shelfLifeMs).toBeDefined();
      expect(item.shelfLifeMs).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// dishItems — shelf life rules
// ---------------------------------------------------------------------------
describe("dishItems", () => {
  it("every dish has no cost", () => {
    dishItems().forEach((item) => {
      expect(item.cost).toBeUndefined();
    });
  });

  it("every dish has category 'dish'", () => {
    dishItems().forEach((item) => {
      expect(item.category).toBe("dish");
    });
  });

  it("every dish has a defined shelf life", () => {
    dishItems().forEach((item) => {
      expect(item.shelfLifeMs).toBeDefined();
      expect(item.shelfLifeMs).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// findItem
// ---------------------------------------------------------------------------
describe("findItem", () => {
  it("returns the item for a valid id", () => {
    const item = findItem(itemId("bun"));
    expect(item).toBeDefined();
    expect(item!.name).toBe("Bun");
    expect(item!.category).toBe("raw");
    expect(item!.cost).toBe(1);
  });

  it("returns undefined for unknown id", () => {
    expect(findItem(itemId("nonexistent"))).toBeUndefined();
  });

  it("finds prepped items", () => {
    const item = findItem(itemId("grilled-patty"));
    expect(item).toBeDefined();
    expect(item!.category).toBe("prepped");
  });

  it("finds dish items", () => {
    const item = findItem(itemId("classic-burger"));
    expect(item).toBeDefined();
    expect(item!.category).toBe("dish");
  });
});

// ---------------------------------------------------------------------------
// Specific item spot-checks
// ---------------------------------------------------------------------------
describe("spot checks", () => {
  it("ground beef is raw, costs $2", () => {
    const item = findItem(itemId("ground-beef"));
    expect(item).toEqual({
      id: "ground-beef",
      name: "Ground Beef",
      category: "raw",
      cost: 2,
      shelfLifeMs: undefined,
    });
  });

  it("grilled patty is prepped with 60s shelf life", () => {
    const item = findItem(itemId("grilled-patty"));
    expect(item).toEqual({
      id: "grilled-patty",
      name: "Grilled Patty",
      category: "prepped",
      cost: undefined,
      shelfLifeMs: 60_000,
    });
  });

  it("classic burger is a dish with 45s shelf life", () => {
    const item = findItem(itemId("classic-burger"));
    expect(item).toEqual({
      id: "classic-burger",
      name: "Classic Burger",
      category: "dish",
      cost: undefined,
      shelfLifeMs: 45_000,
    });
  });

  it("miso soup is a dish with 60s shelf life", () => {
    const item = findItem(itemId("miso-soup"));
    expect(item).toEqual({
      id: "miso-soup",
      name: "Miso Soup",
      category: "dish",
      cost: undefined,
      shelfLifeMs: 60_000,
    });
  });

  it("tempura shrimp is prepped with 30s shelf life", () => {
    const item = findItem(itemId("tempura-shrimp"));
    expect(item).toEqual({
      id: "tempura-shrimp",
      name: "Tempura Shrimp",
      category: "prepped",
      cost: undefined,
      shelfLifeMs: 30_000,
    });
  });

  it("salmon is raw, costs $3", () => {
    const item = findItem(itemId("salmon"));
    expect(item).toEqual({
      id: "salmon",
      name: "Salmon",
      category: "raw",
      cost: 3,
      shelfLifeMs: undefined,
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("findItem returns the same item as found in allItems", () => {
    const items = allItems();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: items.length - 1 }),
        (index) => {
          const item = items[index];
          expect(findItem(item.id)).toEqual(item);
        }
      )
    );
  });

  it("every item appears in exactly one category sublist", () => {
    const raw = new Set(rawItems().map((i) => i.id));
    const prepped = new Set(preppedItems().map((i) => i.id));
    const dishes = new Set(dishItems().map((i) => i.id));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: allItems().length - 1 }),
        (index) => {
          const item = allItems()[index];
          const inRaw = raw.has(item.id);
          const inPrepped = prepped.has(item.id);
          const inDishes = dishes.has(item.id);
          // Exactly one must be true
          expect([inRaw, inPrepped, inDishes].filter(Boolean).length).toBe(1);
        }
      )
    );
  });

  it("raw items have cost, non-raw items do not", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: allItems().length - 1 }),
        (index) => {
          const item = allItems()[index];
          if (item.category === "raw") {
            expect(item.cost).toBeDefined();
          } else {
            expect(item.cost).toBeUndefined();
          }
        }
      )
    );
  });

  it("non-raw items always have a shelf life", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: allItems().length - 1 }),
        (index) => {
          const item = allItems()[index];
          if (item.category !== "raw") {
            expect(item.shelfLifeMs).toBeDefined();
            expect(item.shelfLifeMs).toBeGreaterThan(0);
          }
        }
      )
    );
  });
});
