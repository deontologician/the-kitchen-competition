import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createInventory,
  addItem,
  addItems,
  removeItems,
  removeItemSet,
  removeExpired,
  countItem,
  itemCounts,
  hasIngredientsFor,
  executeRecipeStep,
} from "../inventory";
import type { Inventory } from "../inventory";
import { findRecipe } from "../recipes";
import { findItem } from "../items";

// ---------------------------------------------------------------------------
// createInventory
// ---------------------------------------------------------------------------
describe("createInventory", () => {
  it("creates an empty inventory", () => {
    const inv = createInventory();
    expect(inv.items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addItem / addItems
// ---------------------------------------------------------------------------
describe("addItem", () => {
  it("adds a single item", () => {
    const inv = addItem(createInventory(), "bun", 1000);
    expect(inv.items.length).toBe(1);
    expect(inv.items[0].itemId).toBe("bun");
    expect(inv.items[0].createdAt).toBe(1000);
  });

  it("preserves existing items", () => {
    let inv = addItem(createInventory(), "bun", 1000);
    inv = addItem(inv, "cheese", 2000);
    expect(inv.items.length).toBe(2);
    expect(inv.items[0].itemId).toBe("bun");
    expect(inv.items[1].itemId).toBe("cheese");
  });
});

describe("addItems", () => {
  it("adds multiple of the same item", () => {
    const inv = addItems(createInventory(), "bun", 3, 1000);
    expect(inv.items.length).toBe(3);
    expect(inv.items.every((i) => i.itemId === "bun")).toBe(true);
    expect(inv.items.every((i) => i.createdAt === 1000)).toBe(true);
  });

  it("adds zero items returns same inventory", () => {
    const inv = createInventory();
    const result = addItems(inv, "bun", 0, 1000);
    expect(result.items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// countItem / itemCounts
// ---------------------------------------------------------------------------
describe("countItem", () => {
  it("returns 0 for empty inventory", () => {
    expect(countItem(createInventory(), "bun")).toBe(0);
  });

  it("counts matching items", () => {
    let inv = addItems(createInventory(), "bun", 3, 1000);
    inv = addItem(inv, "cheese", 2000);
    expect(countItem(inv, "bun")).toBe(3);
    expect(countItem(inv, "cheese")).toBe(1);
    expect(countItem(inv, "tomato")).toBe(0);
  });
});

describe("itemCounts", () => {
  it("returns empty array for empty inventory", () => {
    expect(itemCounts(createInventory())).toEqual([]);
  });

  it("returns aggregated counts", () => {
    let inv = addItems(createInventory(), "bun", 2, 1000);
    inv = addItems(inv, "cheese", 3, 2000);
    const counts = itemCounts(inv);
    expect(counts).toContainEqual({ itemId: "bun", count: 2 });
    expect(counts).toContainEqual({ itemId: "cheese", count: 3 });
    expect(counts.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// removeItems — FIFO
// ---------------------------------------------------------------------------
describe("removeItems", () => {
  it("removes items FIFO (oldest first)", () => {
    let inv = addItem(createInventory(), "bun", 1000);
    inv = addItem(inv, "bun", 2000);
    inv = addItem(inv, "bun", 3000);
    const result = removeItems(inv, "bun", 2);
    expect(result).toBeDefined();
    expect(result!.items.length).toBe(1);
    expect(result!.items[0].createdAt).toBe(3000); // newest remains
  });

  it("returns undefined if insufficient quantity", () => {
    const inv = addItem(createInventory(), "bun", 1000);
    expect(removeItems(inv, "bun", 2)).toBeUndefined();
  });

  it("returns undefined if item not present", () => {
    expect(removeItems(createInventory(), "bun", 1)).toBeUndefined();
  });

  it("removes exact quantity leaves empty", () => {
    const inv = addItems(createInventory(), "bun", 3, 1000);
    const result = removeItems(inv, "bun", 3);
    expect(result).toBeDefined();
    expect(countItem(result!, "bun")).toBe(0);
  });

  it("does not affect other items", () => {
    let inv = addItems(createInventory(), "bun", 2, 1000);
    inv = addItem(inv, "cheese", 2000);
    const result = removeItems(inv, "bun", 1);
    expect(result).toBeDefined();
    expect(countItem(result!, "cheese")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeItemSet — atomic all-or-nothing
// ---------------------------------------------------------------------------
describe("removeItemSet", () => {
  it("removes all required items atomically", () => {
    let inv = addItems(createInventory(), "bun", 2, 1000);
    inv = addItems(inv, "cheese", 1, 2000);
    const result = removeItemSet(inv, [
      { itemId: "bun", quantity: 1 },
      { itemId: "cheese", quantity: 1 },
    ]);
    expect(result).toBeDefined();
    expect(countItem(result!, "bun")).toBe(1);
    expect(countItem(result!, "cheese")).toBe(0);
  });

  it("returns undefined if any item is insufficient", () => {
    const inv = addItem(createInventory(), "bun", 1000);
    const result = removeItemSet(inv, [
      { itemId: "bun", quantity: 1 },
      { itemId: "cheese", quantity: 1 },
    ]);
    expect(result).toBeUndefined();
  });

  it("is atomic — inventory unchanged on failure", () => {
    let inv = addItems(createInventory(), "bun", 2, 1000);
    inv = addItem(inv, "cheese", 2000);
    const result = removeItemSet(inv, [
      { itemId: "bun", quantity: 2 },
      { itemId: "cheese", quantity: 5 }, // not enough
    ]);
    expect(result).toBeUndefined();
    // Original inventory unchanged
    expect(countItem(inv, "bun")).toBe(2);
    expect(countItem(inv, "cheese")).toBe(1);
  });

  it("handles empty requirements", () => {
    const inv = addItem(createInventory(), "bun", 1000);
    const result = removeItemSet(inv, []);
    expect(result).toBeDefined();
    expect(countItem(result!, "bun")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// removeExpired
// ---------------------------------------------------------------------------
describe("removeExpired", () => {
  it("removes items past their shelf life", () => {
    // grilled-patty has 60s shelf life
    let inv = addItem(createInventory(), "grilled-patty", 1000);
    inv = addItem(inv, "grilled-patty", 50_000);
    // At t=62_000: first one expired (1000 + 60000 = 61000 < 62000), second still good
    const result = removeExpired(inv, 62_000);
    expect(result.items.length).toBe(1);
    expect(result.items[0].createdAt).toBe(50_000);
  });

  it("keeps raw items (no shelf life)", () => {
    const inv = addItem(createInventory(), "bun", 1000);
    const result = removeExpired(inv, 999_999);
    expect(result.items.length).toBe(1);
  });

  it("keeps items within shelf life", () => {
    // grilled-patty has 60s shelf
    const inv = addItem(createInventory(), "grilled-patty", 1000);
    const result = removeExpired(inv, 30_000); // 29s elapsed, well within 60s
    expect(result.items.length).toBe(1);
  });

  it("handles empty inventory", () => {
    const result = removeExpired(createInventory(), 1000);
    expect(result.items.length).toBe(0);
  });

  it("removes at exact expiry boundary", () => {
    // tempura-shrimp has 30s shelf life
    const inv = addItem(createInventory(), "tempura-shrimp", 0);
    // At exactly 30_000, createdAt(0) + shelfLife(30000) = 30000 <= 30000 → expired
    const result = removeExpired(inv, 30_000);
    expect(result.items.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hasIngredientsFor
// ---------------------------------------------------------------------------
describe("hasIngredientsFor", () => {
  it("returns true when all ingredients present", () => {
    const recipe = findRecipe("shredded-lettuce")!;
    const inv = addItem(createInventory(), "lettuce", 1000);
    expect(hasIngredientsFor(inv, recipe)).toBe(true);
  });

  it("returns false when ingredient missing", () => {
    const recipe = findRecipe("shredded-lettuce")!;
    expect(hasIngredientsFor(createInventory(), recipe)).toBe(false);
  });

  it("returns false when insufficient quantity", () => {
    // sushi-rice requires rice + rice-vinegar
    const recipe = findRecipe("sushi-rice")!;
    const inv = addItem(createInventory(), "rice", 1000);
    expect(hasIngredientsFor(inv, recipe)).toBe(false);
  });

  it("returns true for multi-input recipe when all present", () => {
    const recipe = findRecipe("sushi-rice")!;
    let inv = addItem(createInventory(), "rice", 1000);
    inv = addItem(inv, "rice-vinegar", 1000);
    expect(hasIngredientsFor(inv, recipe)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// executeRecipeStep
// ---------------------------------------------------------------------------
describe("executeRecipeStep", () => {
  it("consumes inputs and produces output", () => {
    const recipe = findRecipe("shredded-lettuce")!;
    const inv = addItem(createInventory(), "lettuce", 1000);
    const result = executeRecipeStep(inv, recipe, 5000);
    expect(result).toBeDefined();
    expect(countItem(result!, "lettuce")).toBe(0);
    expect(countItem(result!, "shredded-lettuce")).toBe(1);
  });

  it("returns undefined if ingredients insufficient", () => {
    const recipe = findRecipe("shredded-lettuce")!;
    const result = executeRecipeStep(createInventory(), recipe, 5000);
    expect(result).toBeUndefined();
  });

  it("sets createdAt on the produced item", () => {
    const recipe = findRecipe("beef-patty")!;
    const inv = addItem(createInventory(), "ground-beef", 1000);
    const result = executeRecipeStep(inv, recipe, 8000)!;
    const produced = result.items.find((i) => i.itemId === "beef-patty");
    expect(produced).toBeDefined();
    expect(produced!.createdAt).toBe(8000);
  });

  it("handles multi-input recipe (sushi-rice)", () => {
    const recipe = findRecipe("sushi-rice")!;
    let inv = addItem(createInventory(), "rice", 1000);
    inv = addItem(inv, "rice-vinegar", 1000);
    const result = executeRecipeStep(inv, recipe, 10000);
    expect(result).toBeDefined();
    expect(countItem(result!, "rice")).toBe(0);
    expect(countItem(result!, "rice-vinegar")).toBe(0);
    expect(countItem(result!, "sushi-rice")).toBe(1);
  });

  it("is atomic — inventory unchanged on failure", () => {
    const recipe = findRecipe("sushi-rice")!;
    const inv = addItem(createInventory(), "rice", 1000);
    // missing rice-vinegar
    const result = executeRecipeStep(inv, recipe, 10000);
    expect(result).toBeUndefined();
    expect(countItem(inv, "rice")).toBe(1);
  });

  it("executes assemble recipe (classic burger)", () => {
    const recipe = findRecipe("classic-burger")!;
    let inv = createInventory();
    inv = addItem(inv, "bun", 1000);
    inv = addItem(inv, "grilled-patty", 1000);
    inv = addItem(inv, "shredded-lettuce", 1000);
    inv = addItem(inv, "sliced-tomato", 1000);
    const result = executeRecipeStep(inv, recipe, 20000);
    expect(result).toBeDefined();
    expect(countItem(result!, "classic-burger")).toBe(1);
    expect(countItem(result!, "bun")).toBe(0);
    expect(countItem(result!, "grilled-patty")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("addItems then countItem returns the added quantity", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 100_000 }),
        (qty, time) => {
          const inv = addItems(createInventory(), "bun", qty, time);
          expect(countItem(inv, "bun")).toBe(qty);
        }
      )
    );
  });

  it("removeItems + remaining = original count", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (total, toRemove) => {
          const inv = addItems(createInventory(), "bun", total, 1000);
          if (toRemove <= total) {
            const result = removeItems(inv, "bun", toRemove)!;
            expect(countItem(result, "bun")).toBe(total - toRemove);
          } else {
            expect(removeItems(inv, "bun", toRemove)).toBeUndefined();
          }
        }
      )
    );
  });

  it("removeItems is FIFO — remaining items have latest timestamps", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 9 }),
        (total, toRemove) => {
          if (toRemove >= total) return;
          // Add items with increasing timestamps
          let inv = createInventory();
          Array.from({ length: total }, (_, i) => i * 1000).forEach(
            (t) => {
              inv = addItem(inv, "bun", t);
            }
          );
          const result = removeItems(inv, "bun", toRemove)!;
          // Remaining items should have the highest timestamps
          const remaining = result.items
            .filter((i) => i.itemId === "bun")
            .map((i) => i.createdAt);
          const minRemaining = Math.min(...remaining);
          expect(minRemaining).toBe(toRemove * 1000);
        }
      )
    );
  });

  it("executeRecipeStep is atomic (inventory unchanged on failure)", () => {
    const recipe = findRecipe("sushi-rice")!;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        (time) => {
          // Only rice, missing rice-vinegar
          const inv = addItem(createInventory(), "rice", time);
          const result = executeRecipeStep(inv, recipe, time + 5000);
          expect(result).toBeUndefined();
          // Verify original is untouched
          expect(countItem(inv, "rice")).toBe(1);
        }
      )
    );
  });

  it("itemCounts totals match individual countItem calls", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom("bun", "cheese", "lettuce"),
            time: fc.integer({ min: 0, max: 100_000 }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        (additions) => {
          let inv = createInventory();
          additions.forEach(({ id, time }) => {
            inv = addItem(inv, id, time);
          });
          const counts = itemCounts(inv);
          counts.forEach(({ itemId, count }) => {
            expect(count).toBe(countItem(inv, itemId));
          });
        }
      )
    );
  });
});
