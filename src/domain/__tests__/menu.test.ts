import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  menuFor,
  dishIdsFor,
  groceryItemsFor,
  availableRecipesFor,
  pickRandomDish,
} from "../menu";
import type { RestaurantType } from "../save-slots";
import { findItem } from "../items";
import { findRecipe, allRecipes, resolveRecipeChain } from "../recipes";

const TYPES: ReadonlyArray<RestaurantType> = ["burger", "bbq", "sushi"];

// ---------------------------------------------------------------------------
// menuFor
// ---------------------------------------------------------------------------
describe("menuFor", () => {
  it("returns a menu for each restaurant type", () => {
    TYPES.forEach((type) => {
      const menu = menuFor(type);
      expect(menu.restaurantType).toBe(type);
      expect(menu.items.length).toBeGreaterThan(0);
    });
  });

  it("each type has exactly 5 dishes", () => {
    TYPES.forEach((type) => {
      expect(menuFor(type).items.length).toBe(5);
    });
  });

  it("every menu item has a positive sell price", () => {
    TYPES.forEach((type) => {
      menuFor(type).items.forEach((mi) => {
        expect(mi.sellPrice).toBeGreaterThan(0);
      });
    });
  });

  it("every menu item references a valid dish item", () => {
    TYPES.forEach((type) => {
      menuFor(type).items.forEach((mi) => {
        const item = findItem(mi.dishId);
        expect(item, `Dish "${mi.dishId}" not found`).toBeDefined();
        expect(item!.category).toBe("dish");
      });
    });
  });
});

// ---------------------------------------------------------------------------
// dishIdsFor
// ---------------------------------------------------------------------------
describe("dishIdsFor", () => {
  it("returns 5 dish ids per type", () => {
    TYPES.forEach((type) => {
      expect(dishIdsFor(type).length).toBe(5);
    });
  });

  it("burger dishes are burger dishes", () => {
    const ids = dishIdsFor("burger");
    expect(ids).toContain("classic-burger");
    expect(ids).toContain("cheeseburger");
    expect(ids).toContain("bacon-cheeseburger");
    expect(ids).toContain("chicken-sandwich");
    expect(ids).toContain("loaded-fries");
  });

  it("bbq dishes are bbq dishes", () => {
    const ids = dishIdsFor("bbq");
    expect(ids).toContain("pulled-pork-sandwich");
    expect(ids).toContain("smoked-ribs-plate");
    expect(ids).toContain("brisket-sandwich");
    expect(ids).toContain("bbq-burger");
    expect(ids).toContain("smoked-chicken-plate");
  });

  it("sushi dishes are sushi dishes", () => {
    const ids = dishIdsFor("sushi");
    expect(ids).toContain("salmon-nigiri");
    expect(ids).toContain("tuna-roll");
    expect(ids).toContain("california-roll");
    expect(ids).toContain("tempura-shrimp-roll");
    expect(ids).toContain("miso-soup");
  });
});

// ---------------------------------------------------------------------------
// groceryItemsFor
// ---------------------------------------------------------------------------
describe("groceryItemsFor", () => {
  it("returns only raw item ids", () => {
    TYPES.forEach((type) => {
      groceryItemsFor(type).forEach((id) => {
        const item = findItem(id);
        expect(item, `Item "${id}" not found`).toBeDefined();
        expect(item!.category).toBe("raw");
      });
    });
  });

  it("burger uses 9 unique raw ingredients", () => {
    expect(groceryItemsFor("burger").length).toBe(9);
  });

  it("bbq uses 11 unique raw ingredients", () => {
    expect(groceryItemsFor("bbq").length).toBe(11);
  });

  it("sushi uses 11 unique raw ingredients", () => {
    expect(groceryItemsFor("sushi").length).toBe(11);
  });

  it("burger grocery list includes expected items", () => {
    const items = groceryItemsFor("burger");
    expect(items).toContain("bun");
    expect(items).toContain("ground-beef");
    expect(items).toContain("lettuce");
    expect(items).toContain("tomato");
    expect(items).toContain("cheese");
    expect(items).toContain("bacon");
    expect(items).toContain("chicken-breast");
    expect(items).toContain("potato");
    expect(items).toContain("onion");
  });

  it("sushi grocery list includes expected items", () => {
    const items = groceryItemsFor("sushi");
    expect(items).toContain("rice");
    expect(items).toContain("rice-vinegar");
    expect(items).toContain("nori");
    expect(items).toContain("salmon");
    expect(items).toContain("tuna");
    expect(items).toContain("shrimp");
    expect(items).toContain("cucumber");
    expect(items).toContain("avocado");
    expect(items).toContain("crab");
    expect(items).toContain("tofu");
    expect(items).toContain("miso-paste");
  });

  it("no duplicates in grocery lists", () => {
    TYPES.forEach((type) => {
      const items = groceryItemsFor(type);
      expect(new Set(items).size).toBe(items.length);
    });
  });
});

// ---------------------------------------------------------------------------
// availableRecipesFor
// ---------------------------------------------------------------------------
describe("availableRecipesFor", () => {
  it("returns all prep/cook/assemble steps for each type", () => {
    TYPES.forEach((type) => {
      const recipes = availableRecipesFor(type);
      expect(recipes.length).toBeGreaterThan(0);
      recipes.forEach((r) => {
        expect(findRecipe(r.id)).toBeDefined();
      });
    });
  });

  it("burger has recipes for all its intermediates and dishes", () => {
    const recipes = availableRecipesFor("burger");
    const ids = recipes.map((r) => r.id);
    // Some expected intermediates
    expect(ids).toContain("shredded-lettuce");
    expect(ids).toContain("beef-patty");
    expect(ids).toContain("grilled-patty");
    // All dishes
    expect(ids).toContain("classic-burger");
    expect(ids).toContain("cheeseburger");
  });

  it("no duplicates in recipe lists", () => {
    TYPES.forEach((type) => {
      const recipes = availableRecipesFor(type);
      const ids = recipes.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

// ---------------------------------------------------------------------------
// pickRandomDish
// ---------------------------------------------------------------------------
describe("pickRandomDish", () => {
  it("returns a valid menu item for value 0", () => {
    TYPES.forEach((type) => {
      const item = pickRandomDish(type, 0);
      expect(item).toBeDefined();
      expect(findItem(item.dishId)).toBeDefined();
    });
  });

  it("returns a valid menu item for value 0.999", () => {
    TYPES.forEach((type) => {
      const item = pickRandomDish(type, 0.999);
      expect(item).toBeDefined();
      expect(findItem(item.dishId)).toBeDefined();
    });
  });

  it("different random values can produce different dishes", () => {
    // With 5 dishes per type, check that we get more than 1 unique dish
    const dishes = Array.from({ length: 5 }, (_, i) =>
      pickRandomDish("burger", i / 5).dishId
    );
    expect(new Set(dishes).size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Sell price spot-checks
// ---------------------------------------------------------------------------
describe("sell prices", () => {
  it("burger classic burger sells for 5", () => {
    const menu = menuFor("burger");
    const item = menu.items.find((m) => m.dishId === "classic-burger");
    expect(item!.sellPrice).toBe(5);
  });

  it("sushi california roll sells for 7", () => {
    const menu = menuFor("sushi");
    const item = menu.items.find((m) => m.dishId === "california-roll");
    expect(item!.sellPrice).toBe(7);
  });

  it("bbq smoked chicken plate sells for 4", () => {
    const menu = menuFor("bbq");
    const item = menu.items.find((m) => m.dishId === "smoked-chicken-plate");
    expect(item!.sellPrice).toBe(4);
  });

  it("sushi miso soup sells for 2", () => {
    const menu = menuFor("sushi");
    const item = menu.items.find((m) => m.dishId === "miso-soup");
    expect(item!.sellPrice).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("pickRandomDish always returns a dish from the menu", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        (type, randomValue) => {
          const item = pickRandomDish(type, randomValue);
          const menuIds = dishIdsFor(type);
          expect(menuIds).toContain(item.dishId);
        }
      )
    );
  });

  it("groceryItemsFor are all reachable from the type's dishes", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), (type) => {
        const groceries = groceryItemsFor(type);
        const dishes = dishIdsFor(type);
        // Collect all raw items reachable from dish chains
        const reachable = new Set<string>();
        dishes.forEach((dishId) => {
          const chain = resolveRecipeChain(dishId);
          if (chain === undefined) return;
          const collectRaws = (node: { step: { inputs: ReadonlyArray<{ itemId: string }> }; children: ReadonlyArray<typeof node> }): void => {
            node.step.inputs.forEach((input) => {
              const item = findItem(input.itemId);
              if (item !== undefined && item.category === "raw") {
                reachable.add(input.itemId);
              }
            });
            node.children.forEach(collectRaws);
          };
          collectRaws(chain);
        });
        // Every grocery item must be reachable
        groceries.forEach((id) => {
          expect(reachable.has(id), `${id} not reachable from ${type} dishes`).toBe(true);
        });
        // Every reachable raw must be in groceries
        reachable.forEach((id) => {
          expect(groceries).toContain(id);
        });
      })
    );
  });

  it("all menu sell prices are positive integers", () => {
    fc.assert(
      fc.property(fc.constantFrom(...TYPES), (type) => {
        menuFor(type).items.forEach((mi) => {
          expect(mi.sellPrice).toBeGreaterThan(0);
          expect(Number.isInteger(mi.sellPrice)).toBe(true);
        });
      })
    );
  });
});
