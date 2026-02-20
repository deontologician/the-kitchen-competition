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
import { itemId, type ItemId } from "../branded";

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
    expect(ids).toContain(itemId("classic-burger"));
    expect(ids).toContain(itemId("cheeseburger"));
    expect(ids).toContain(itemId("bacon-cheeseburger"));
    expect(ids).toContain(itemId("chicken-sandwich"));
    expect(ids).toContain(itemId("loaded-fries"));
  });

  it("bbq dishes are bbq dishes", () => {
    const ids = dishIdsFor("bbq");
    expect(ids).toContain(itemId("pulled-pork-sandwich"));
    expect(ids).toContain(itemId("smoked-ribs-plate"));
    expect(ids).toContain(itemId("brisket-sandwich"));
    expect(ids).toContain(itemId("bbq-burger"));
    expect(ids).toContain(itemId("smoked-chicken-plate"));
  });

  it("sushi dishes are sushi dishes", () => {
    const ids = dishIdsFor("sushi");
    expect(ids).toContain(itemId("salmon-nigiri"));
    expect(ids).toContain(itemId("tuna-roll"));
    expect(ids).toContain(itemId("california-roll"));
    expect(ids).toContain(itemId("tempura-shrimp-roll"));
    expect(ids).toContain(itemId("miso-soup"));
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
    expect(items).toContain(itemId("bun"));
    expect(items).toContain(itemId("ground-beef"));
    expect(items).toContain(itemId("lettuce"));
    expect(items).toContain(itemId("tomato"));
    expect(items).toContain(itemId("cheese"));
    expect(items).toContain(itemId("bacon"));
    expect(items).toContain(itemId("chicken-breast"));
    expect(items).toContain(itemId("potato"));
    expect(items).toContain(itemId("onion"));
  });

  it("sushi grocery list includes expected items", () => {
    const items = groceryItemsFor("sushi");
    expect(items).toContain(itemId("rice"));
    expect(items).toContain(itemId("rice-vinegar"));
    expect(items).toContain(itemId("nori"));
    expect(items).toContain(itemId("salmon"));
    expect(items).toContain(itemId("tuna"));
    expect(items).toContain(itemId("shrimp"));
    expect(items).toContain(itemId("cucumber"));
    expect(items).toContain(itemId("avocado"));
    expect(items).toContain(itemId("crab"));
    expect(items).toContain(itemId("tofu"));
    expect(items).toContain(itemId("miso-paste"));
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
    expect(ids).toContain(itemId("shredded-lettuce"));
    expect(ids).toContain(itemId("beef-patty"));
    expect(ids).toContain(itemId("grilled-patty"));
    // All dishes
    expect(ids).toContain(itemId("classic-burger"));
    expect(ids).toContain(itemId("cheeseburger"));
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
  it("burger classic burger sells for 8", () => {
    const menu = menuFor("burger");
    const item = menu.items.find((m) => m.dishId === "classic-burger");
    expect(item!.sellPrice).toBe(8);
  });

  it("sushi california roll sells for 12", () => {
    const menu = menuFor("sushi");
    const item = menu.items.find((m) => m.dishId === "california-roll");
    expect(item!.sellPrice).toBe(12);
  });

  it("bbq smoked chicken plate sells for 7", () => {
    const menu = menuFor("bbq");
    const item = menu.items.find((m) => m.dishId === "smoked-chicken-plate");
    expect(item!.sellPrice).toBe(7);
  });

  it("sushi miso soup sells for 5", () => {
    const menu = menuFor("sushi");
    const item = menu.items.find((m) => m.dishId === "miso-soup");
    expect(item!.sellPrice).toBe(5);
  });

  it("all dishes are profitable (sell price > ingredient cost)", () => {
    TYPES.forEach((type) => {
      menuFor(type).items.forEach((mi) => {
        const chain = resolveRecipeChain(mi.dishId);
        if (chain === undefined) return;
        // Collect all raw ingredient costs
        let totalCost = 0;
        const countRaws = (node: { step: { inputs: ReadonlyArray<{ itemId: ItemId; quantity: number }> }; children: ReadonlyArray<typeof node> }): void => {
          node.step.inputs.forEach((input) => {
            const item = findItem(input.itemId);
            if (item !== undefined && item.category === "raw" && item.cost !== undefined) {
              totalCost += item.cost * input.quantity;
            }
          });
          node.children.forEach(countRaws);
        };
        countRaws(chain);
        expect(
          mi.sellPrice,
          `${mi.dishId} sells for $${mi.sellPrice} but costs $${totalCost} in ingredients`
        ).toBeGreaterThan(totalCost);
      });
    });
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
          const collectRaws = (node: { step: { inputs: ReadonlyArray<{ itemId: ItemId }> }; children: ReadonlyArray<typeof node> }): void => {
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
