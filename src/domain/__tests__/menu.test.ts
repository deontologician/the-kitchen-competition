import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  menuFor,
  dishIdsFor,
  groceryItemsFor,
  availableRecipesFor,
  pickRandomDish,
  STARTER_DISH_COUNT,
  unlockedMenuFor,
  unlockedDishIdsFor,
  unlockedGroceryItemsFor,
  unlockedRecipesFor,
  shouldUnlockNextDish,
  enabledDishIds,
  enabledGroceryItemsFor,
  enabledRecipesFor,
} from "../menu";
import type { RestaurantType } from "../restaurant-type";
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

  it("pickRandomDish with count=1 always returns the starter", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        (type, randomValue) => {
          const item = pickRandomDish(type, randomValue, 1);
          expect(item.dishId).toBe(menuFor(type).items[0].dishId);
        }
      )
    );
  });

  it("pickRandomDish with unlockedCount restricts to unlocked range", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        fc.integer({ min: 1, max: 5 }),
        (type, randomValue, count) => {
          const item = pickRandomDish(type, randomValue, count);
          const unlocked = unlockedDishIdsFor(type, count);
          expect(unlocked).toContain(item.dishId);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Menu ordering — starter dishes
// ---------------------------------------------------------------------------
describe("menu ordering", () => {
  it("burger starter is classic-burger", () => {
    expect(menuFor("burger").items[0].dishId).toBe(itemId("classic-burger"));
  });

  it("bbq starter is smoked-ribs-plate", () => {
    expect(menuFor("bbq").items[0].dishId).toBe(itemId("smoked-ribs-plate"));
  });

  it("sushi starter is salmon-nigiri", () => {
    expect(menuFor("sushi").items[0].dishId).toBe(itemId("salmon-nigiri"));
  });

  it("burger order is classic-burger, cheeseburger, chicken-sandwich, loaded-fries, bacon-cheeseburger", () => {
    const ids = dishIdsFor("burger");
    expect(ids).toEqual([
      itemId("classic-burger"),
      itemId("cheeseburger"),
      itemId("chicken-sandwich"),
      itemId("loaded-fries"),
      itemId("bacon-cheeseburger"),
    ]);
  });

  it("bbq order is smoked-ribs-plate, smoked-chicken-plate, pulled-pork-sandwich, brisket-sandwich, bbq-burger", () => {
    const ids = dishIdsFor("bbq");
    expect(ids).toEqual([
      itemId("smoked-ribs-plate"),
      itemId("smoked-chicken-plate"),
      itemId("pulled-pork-sandwich"),
      itemId("brisket-sandwich"),
      itemId("bbq-burger"),
    ]);
  });

  it("sushi order is salmon-nigiri, miso-soup, tuna-roll, california-roll, tempura-shrimp-roll", () => {
    const ids = dishIdsFor("sushi");
    expect(ids).toEqual([
      itemId("salmon-nigiri"),
      itemId("miso-soup"),
      itemId("tuna-roll"),
      itemId("california-roll"),
      itemId("tempura-shrimp-roll"),
    ]);
  });
});

// ---------------------------------------------------------------------------
// STARTER_DISH_COUNT
// ---------------------------------------------------------------------------
describe("STARTER_DISH_COUNT", () => {
  it("is 1", () => {
    expect(STARTER_DISH_COUNT).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// unlockedMenuFor
// ---------------------------------------------------------------------------
describe("unlockedMenuFor", () => {
  it("returns 1 item when count=1", () => {
    TYPES.forEach((type) => {
      const menu = unlockedMenuFor(type, 1);
      expect(menu.items.length).toBe(1);
    });
  });

  it("returns all 5 items when count=5", () => {
    TYPES.forEach((type) => {
      const menu = unlockedMenuFor(type, 5);
      expect(menu.items.length).toBe(5);
    });
  });

  it("clamps count to minimum 1", () => {
    TYPES.forEach((type) => {
      const menu = unlockedMenuFor(type, 0);
      expect(menu.items.length).toBe(1);
    });
  });

  it("clamps count to maximum items.length", () => {
    TYPES.forEach((type) => {
      const menu = unlockedMenuFor(type, 99);
      expect(menu.items.length).toBe(5);
    });
  });

  it("preserves restaurant type", () => {
    TYPES.forEach((type) => {
      expect(unlockedMenuFor(type, 3).restaurantType).toBe(type);
    });
  });
});

// ---------------------------------------------------------------------------
// unlockedDishIdsFor
// ---------------------------------------------------------------------------
describe("unlockedDishIdsFor", () => {
  it("returns 1 dish id when count=1", () => {
    TYPES.forEach((type) => {
      expect(unlockedDishIdsFor(type, 1).length).toBe(1);
    });
  });

  it("returns the starter as the only dish for count=1", () => {
    expect(unlockedDishIdsFor("burger", 1)).toEqual([itemId("classic-burger")]);
    expect(unlockedDishIdsFor("bbq", 1)).toEqual([itemId("smoked-ribs-plate")]);
    expect(unlockedDishIdsFor("sushi", 1)).toEqual([itemId("salmon-nigiri")]);
  });

  it("returns all 5 for count=5", () => {
    TYPES.forEach((type) => {
      expect(unlockedDishIdsFor(type, 5).length).toBe(5);
    });
  });
});

// ---------------------------------------------------------------------------
// unlockedGroceryItemsFor
// ---------------------------------------------------------------------------
describe("unlockedGroceryItemsFor", () => {
  it("returns only raw items for starter dishes", () => {
    TYPES.forEach((type) => {
      unlockedGroceryItemsFor(type, 1).forEach((id) => {
        const item = findItem(id);
        expect(item).toBeDefined();
        expect(item!.category).toBe("raw");
      });
    });
  });

  it("sushi starter (salmon-nigiri) needs rice, rice-vinegar, salmon", () => {
    const items = unlockedGroceryItemsFor("sushi", 1);
    expect(items).toContain(itemId("rice"));
    expect(items).toContain(itemId("rice-vinegar"));
    expect(items).toContain(itemId("salmon"));
    // Should NOT contain other sushi ingredients
    expect(items).not.toContain(itemId("nori"));
    expect(items).not.toContain(itemId("tuna"));
  });

  it("returns full list for count=5", () => {
    TYPES.forEach((type) => {
      const full = groceryItemsFor(type);
      const unlocked = unlockedGroceryItemsFor(type, 5);
      expect(new Set(unlocked)).toEqual(new Set(full));
    });
  });
});

// ---------------------------------------------------------------------------
// unlockedRecipesFor
// ---------------------------------------------------------------------------
describe("unlockedRecipesFor", () => {
  it("returns only recipes reachable from starter dish", () => {
    TYPES.forEach((type) => {
      const recipes = unlockedRecipesFor(type, 1);
      expect(recipes.length).toBeGreaterThan(0);
      // All recipes should be valid
      recipes.forEach((r) => {
        expect(findRecipe(r.id)).toBeDefined();
      });
    });
  });

  it("returns full list for count=5", () => {
    TYPES.forEach((type) => {
      const full = availableRecipesFor(type);
      const unlocked = unlockedRecipesFor(type, 5);
      expect(new Set(unlocked.map((r) => r.id))).toEqual(
        new Set(full.map((r) => r.id))
      );
    });
  });
});

// ---------------------------------------------------------------------------
// shouldUnlockNextDish
// ---------------------------------------------------------------------------
describe("shouldUnlockNextDish", () => {
  it("unlocks next dish when 0 lost and coins > 0 and room to unlock", () => {
    expect(shouldUnlockNextDish(0, 10, 1)).toBe(2);
  });

  it("does not unlock when customers were lost", () => {
    expect(shouldUnlockNextDish(1, 10, 1)).toBe(1);
  });

  it("does not unlock when coins are 0", () => {
    expect(shouldUnlockNextDish(0, 0, 2)).toBe(2);
  });

  it("does not unlock when already at max (5)", () => {
    expect(shouldUnlockNextDish(0, 10, 5)).toBe(5);
  });

  it("does not unlock when already at custom max", () => {
    expect(shouldUnlockNextDish(0, 10, 3, 3)).toBe(3);
  });

  it("respects custom maxDishes", () => {
    expect(shouldUnlockNextDish(0, 10, 2, 4)).toBe(3);
  });

  it("property: result >= currentUnlocked and <= max(currentUnlocked, maxDishes)", () => {
    fc.assert(
      fc.property(
        fc.nat(50),
        fc.nat(100),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        (lost, coins, current, max) => {
          const result = shouldUnlockNextDish(lost, coins, current, max);
          expect(result).toBeGreaterThanOrEqual(current);
          expect(result).toBeLessThanOrEqual(Math.max(current, max));
        }
      )
    );
  });

  it("property: at most +1 increase", () => {
    fc.assert(
      fc.property(
        fc.nat(50),
        fc.nat(100),
        fc.integer({ min: 1, max: 5 }),
        (lost, coins, current) => {
          const result = shouldUnlockNextDish(lost, coins, current);
          expect(result - current).toBeLessThanOrEqual(1);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// enabledDishIds
// ---------------------------------------------------------------------------
describe("enabledDishIds", () => {
  it("excludes disabled items from the unlocked set", () => {
    const disabled = [itemId("cheeseburger")];
    const ids = enabledDishIds("burger", 3, disabled);
    expect(ids).not.toContain(itemId("cheeseburger"));
    expect(ids).toContain(itemId("classic-burger"));
    expect(ids).toContain(itemId("chicken-sandwich"));
  });

  it("returns all unlocked when none disabled", () => {
    const ids = enabledDishIds("burger", 3, []);
    expect(ids.length).toBe(3);
  });

  it("never returns empty (fallback to first unlocked dish)", () => {
    // Disable all 3 unlocked dishes — should fall back to first
    const disabled = [
      itemId("classic-burger"),
      itemId("cheeseburger"),
      itemId("chicken-sandwich"),
    ];
    const ids = enabledDishIds("burger", 3, disabled);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids[0]).toBe(itemId("classic-burger"));
  });

  it("ignores disabled ids that are not in the unlocked set", () => {
    const disabled = [itemId("bacon-cheeseburger")]; // 5th dish, not unlocked at count=3
    const ids = enabledDishIds("burger", 3, disabled);
    expect(ids.length).toBe(3); // unaffected
  });
});

// ---------------------------------------------------------------------------
// enabledGroceryItemsFor
// ---------------------------------------------------------------------------
describe("enabledGroceryItemsFor", () => {
  it("omits ingredients exclusive to disabled dishes", () => {
    // chicken-breast is only used in chicken-sandwich
    const disabled = [itemId("chicken-sandwich")];
    const items = enabledGroceryItemsFor("burger", 5, disabled);
    expect(items).not.toContain(itemId("chicken-breast"));
  });

  it("includes ingredients for enabled dishes", () => {
    const disabled = [itemId("cheeseburger")];
    const items = enabledGroceryItemsFor("burger", 3, disabled);
    expect(items).toContain(itemId("bun"));
    expect(items).toContain(itemId("ground-beef"));
  });

  it("returns only raw items", () => {
    TYPES.forEach((type) => {
      enabledGroceryItemsFor(type, 3, []).forEach((id) => {
        const item = findItem(id);
        expect(item).toBeDefined();
        expect(item!.category).toBe("raw");
      });
    });
  });

  it("equals unlockedGroceryItemsFor when nothing disabled", () => {
    TYPES.forEach((type) => {
      const expected = unlockedGroceryItemsFor(type, 3);
      const actual = enabledGroceryItemsFor(type, 3, []);
      expect(new Set(actual)).toEqual(new Set(expected));
    });
  });
});

// ---------------------------------------------------------------------------
// enabledRecipesFor
// ---------------------------------------------------------------------------
describe("enabledRecipesFor", () => {
  it("returns only recipes reachable from enabled dishes", () => {
    // Disable cheeseburger — its exclusive recipe should not appear
    const disabled = [itemId("cheeseburger")];
    const enabled = enabledRecipesFor("burger", 2, disabled);
    const allIds = enabled.map((r) => r.id);
    // classic-burger recipes are still present
    expect(allIds).toContain(itemId("beef-patty"));
    expect(allIds).toContain(itemId("classic-burger"));
    // cheeseburger itself should not be in the enabled list
    expect(allIds).not.toContain(itemId("cheeseburger"));
  });

  it("equals unlockedRecipesFor when nothing disabled", () => {
    TYPES.forEach((type) => {
      const expected = unlockedRecipesFor(type, 3);
      const actual = enabledRecipesFor(type, 3, []);
      expect(new Set(actual.map((r) => r.id))).toEqual(
        new Set(expected.map((r) => r.id))
      );
    });
  });
});

// ---------------------------------------------------------------------------
// pickRandomDish with disabledDishes
// ---------------------------------------------------------------------------
describe("pickRandomDish with disabledDishes", () => {
  it("with all-but-one disabled always returns the enabled dish", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        (type, randomValue) => {
          const allIds = unlockedDishIdsFor(type, 5);
          const enabled = allIds[0];
          const disabled = allIds.slice(1);
          const item = pickRandomDish(type, randomValue, 5, disabled);
          expect(item.dishId).toBe(enabled);
        }
      )
    );
  });

  it("with empty disabled behaves same as no disabledDishes arg", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.double({ min: 0, max: 0.9999, noNaN: true }),
        fc.integer({ min: 1, max: 5 }),
        (type, randomValue, count) => {
          const withEmpty = pickRandomDish(type, randomValue, count, []);
          const withUndefined = pickRandomDish(type, randomValue, count);
          expect(withEmpty.dishId).toBe(withUndefined.dishId);
        }
      )
    );
  });
});
