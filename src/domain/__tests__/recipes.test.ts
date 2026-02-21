import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  findRecipe,
  recipesForOutput,
  allRecipes,
  resolveRecipeChain,
  flattenRecipeChain,
  totalRawIngredients,
  totalRecipeTime,
} from "../recipes";
import type { RecipeStep, RecipeNode } from "../recipes";
import { findItem, allItems } from "../items";
import { itemId } from "../branded";
import type { KitchenZone, ZoneInteraction } from "../kitchen-zones";

// ---------------------------------------------------------------------------
// allRecipes — basic invariants
// ---------------------------------------------------------------------------
describe("allRecipes", () => {
  it("returns 46 recipe steps (31 intermediates + 15 dishes)", () => {
    expect(allRecipes().length).toBe(46);
  });

  it("every recipe has a non-empty id and name", () => {
    allRecipes().forEach((r) => {
      expect(r.id.length).toBeGreaterThan(0);
      expect(r.name.length).toBeGreaterThan(0);
    });
  });

  it("all recipe ids are unique", () => {
    const ids = allRecipes().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every recipe has a valid method", () => {
    const validMethods = ["prep", "cook", "assemble"] as const;
    allRecipes().forEach((r) => {
      expect(validMethods).toContain(r.method);
    });
  });

  it("every recipe has at least one input", () => {
    allRecipes().forEach((r) => {
      expect(r.inputs.length).toBeGreaterThan(0);
    });
  });

  it("assemble recipes have timeMs 0, except miso soup", () => {
    allRecipes()
      .filter((r) => r.method === "assemble")
      .forEach((r) => {
        expect(r.timeMs).toBe(0);
      });
  });

  it("prep and cook recipes have positive timeMs", () => {
    allRecipes()
      .filter((r) => r.method === "prep" || r.method === "cook")
      .forEach((r) => {
        expect(r.timeMs).toBeGreaterThan(0);
      });
  });
});

// ---------------------------------------------------------------------------
// Item reference validity
// ---------------------------------------------------------------------------
describe("item references", () => {
  it("every recipe input references a valid item", () => {
    allRecipes().forEach((r) => {
      r.inputs.forEach((input) => {
        expect(
          findItem(input.itemId),
          `Recipe "${r.id}" input "${input.itemId}" not found in items`
        ).toBeDefined();
      });
    });
  });

  it("every recipe output references a valid item", () => {
    allRecipes().forEach((r) => {
      expect(
        findItem(r.output),
        `Recipe "${r.id}" output "${r.output}" not found in items`
      ).toBeDefined();
    });
  });

  it("every recipe input has positive quantity", () => {
    allRecipes().forEach((r) => {
      r.inputs.forEach((input) => {
        expect(input.quantity).toBeGreaterThan(0);
      });
    });
  });

  it("recipe outputs are never raw items", () => {
    allRecipes().forEach((r) => {
      const item = findItem(r.output)!;
      expect(item.category).not.toBe("raw");
    });
  });
});

// ---------------------------------------------------------------------------
// findRecipe
// ---------------------------------------------------------------------------
describe("findRecipe", () => {
  it("returns the recipe for a valid id", () => {
    const recipe = findRecipe(itemId("grilled-patty"));
    expect(recipe).toBeDefined();
    expect(recipe!.name).toBe("Grilled Patty");
    expect(recipe!.method).toBe("cook");
    expect(recipe!.timeMs).toBe(5000);
    expect(recipe!.output).toBe("grilled-patty");
  });

  it("returns undefined for unknown id", () => {
    expect(findRecipe(itemId("nonexistent"))).toBeUndefined();
  });

  it("finds dish recipes", () => {
    const recipe = findRecipe(itemId("classic-burger"));
    expect(recipe).toBeDefined();
    expect(recipe!.method).toBe("assemble");
  });
});

// ---------------------------------------------------------------------------
// recipesForOutput
// ---------------------------------------------------------------------------
describe("recipesForOutput", () => {
  it("finds the recipe that produces grilled-patty", () => {
    const recipes = recipesForOutput(itemId("grilled-patty"));
    expect(recipes.length).toBe(1);
    expect(recipes[0].id).toBe("grilled-patty");
  });

  it("returns empty for raw items (no recipe produces them)", () => {
    expect(recipesForOutput(itemId("ground-beef")).length).toBe(0);
  });

  it("returns empty for unknown id", () => {
    expect(recipesForOutput(itemId("nonexistent")).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveRecipeChain
// ---------------------------------------------------------------------------
describe("resolveRecipeChain", () => {
  it("returns undefined for raw items", () => {
    expect(resolveRecipeChain(itemId("ground-beef"))).toBeUndefined();
  });

  it("returns undefined for unknown items", () => {
    expect(resolveRecipeChain(itemId("nonexistent"))).toBeUndefined();
  });

  it("resolves a simple 1-step chain (shredded-lettuce)", () => {
    const node = resolveRecipeChain(itemId("shredded-lettuce"));
    expect(node).toBeDefined();
    expect(node!.step.id).toBe("shredded-lettuce");
    expect(node!.children.length).toBe(0); // input is raw
  });

  it("resolves a 2-step chain (grilled-patty)", () => {
    const node = resolveRecipeChain(itemId("grilled-patty"));
    expect(node).toBeDefined();
    expect(node!.step.id).toBe("grilled-patty");
    expect(node!.children.length).toBe(1);
    expect(node!.children[0].step.id).toBe("beef-patty");
  });

  it("resolves classic burger with full tree", () => {
    const node = resolveRecipeChain(itemId("classic-burger"));
    expect(node).toBeDefined();
    expect(node!.step.id).toBe("classic-burger");
    // classic-burger inputs: bun (raw), grilled-patty (chain), shredded-lettuce (chain), sliced-tomato (chain)
    // children = non-raw inputs with recipes
    expect(node!.children.length).toBe(3); // grilled-patty, shredded-lettuce, sliced-tomato
  });

  it("resolves the 4-step bbq pulled pork chain", () => {
    const node = resolveRecipeChain(itemId("pulled-pork-sandwich"));
    expect(node).toBeDefined();
    // pulled-pork-sandwich → pulled-pork → smoked-pork → seasoned-pork → [raw]
    const pulledPork = node!.children.find(
      (c) => c.step.id === "pulled-pork"
    );
    expect(pulledPork).toBeDefined();
    const smokedPork = pulledPork!.children.find(
      (c) => c.step.id === "smoked-pork"
    );
    expect(smokedPork).toBeDefined();
    const seasonedPork = smokedPork!.children.find(
      (c) => c.step.id === "seasoned-pork"
    );
    expect(seasonedPork).toBeDefined();
    expect(seasonedPork!.children.length).toBe(0); // input is raw
  });

  it("resolves sushi rice chain (multi-input cook)", () => {
    const node = resolveRecipeChain(itemId("sushi-rice"));
    expect(node).toBeDefined();
    expect(node!.step.id).toBe("sushi-rice");
    // inputs: rice + rice-vinegar, both raw → no children
    expect(node!.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// flattenRecipeChain — topological order
// ---------------------------------------------------------------------------
describe("flattenRecipeChain", () => {
  it("returns steps in topological order (leaves first)", () => {
    const node = resolveRecipeChain(itemId("classic-burger"))!;
    const steps = flattenRecipeChain(node);
    const ids = steps.map((s) => s.id);

    // beef-patty must come before grilled-patty
    expect(ids.indexOf(itemId("beef-patty"))).toBeLessThan(
      ids.indexOf(itemId("grilled-patty"))
    );
    // All intermediates must come before classic-burger
    expect(ids.indexOf(itemId("grilled-patty"))).toBeLessThan(
      ids.indexOf(itemId("classic-burger"))
    );
    expect(ids.indexOf(itemId("shredded-lettuce"))).toBeLessThan(
      ids.indexOf(itemId("classic-burger"))
    );
    expect(ids.indexOf(itemId("sliced-tomato"))).toBeLessThan(
      ids.indexOf(itemId("classic-burger"))
    );
    // classic-burger is last
    expect(ids[ids.length - 1]).toBe("classic-burger");
  });

  it("deduplicates shared steps", () => {
    // grilled-patty is shared between classic-burger and cheeseburger
    // But within a single chain, each step appears once
    const node = resolveRecipeChain(itemId("classic-burger"))!;
    const steps = flattenRecipeChain(node);
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles single-step chain", () => {
    const node = resolveRecipeChain(itemId("shredded-lettuce"))!;
    const steps = flattenRecipeChain(node);
    expect(steps.length).toBe(1);
    expect(steps[0].id).toBe("shredded-lettuce");
  });

  it("flattens 4-step bbq chain correctly", () => {
    const node = resolveRecipeChain(itemId("pulled-pork-sandwich"))!;
    const steps = flattenRecipeChain(node);
    const ids = steps.map((s) => s.id);
    // seasoned-pork → smoked-pork → pulled-pork → coleslaw → pulled-pork-sandwich
    expect(ids.indexOf(itemId("seasoned-pork"))).toBeLessThan(
      ids.indexOf(itemId("smoked-pork"))
    );
    expect(ids.indexOf(itemId("smoked-pork"))).toBeLessThan(
      ids.indexOf(itemId("pulled-pork"))
    );
    expect(ids.indexOf(itemId("pulled-pork"))).toBeLessThan(
      ids.indexOf(itemId("pulled-pork-sandwich"))
    );
  });
});

// ---------------------------------------------------------------------------
// totalRawIngredients
// ---------------------------------------------------------------------------
describe("totalRawIngredients", () => {
  it("returns only raw items", () => {
    const node = resolveRecipeChain(itemId("classic-burger"))!;
    const raws = totalRawIngredients(node);
    raws.forEach((ri) => {
      const item = findItem(ri.itemId)!;
      expect(item.category).toBe("raw");
    });
  });

  it("aggregates classic burger raw ingredients", () => {
    const node = resolveRecipeChain(itemId("classic-burger"))!;
    const raws = totalRawIngredients(node);
    const byId = Object.fromEntries(raws.map((r) => [r.itemId, r.quantity]));
    // bun:1, ground-beef:1, lettuce:1, tomato:1
    expect(byId["bun"]).toBe(1);
    expect(byId["ground-beef"]).toBe(1);
    expect(byId["lettuce"]).toBe(1);
    expect(byId["tomato"]).toBe(1);
  });

  it("aggregates sushi rice raw ingredients", () => {
    const node = resolveRecipeChain(itemId("sushi-rice"))!;
    const raws = totalRawIngredients(node);
    const byId = Object.fromEntries(raws.map((r) => [r.itemId, r.quantity]));
    expect(byId["rice"]).toBe(1);
    expect(byId["rice-vinegar"]).toBe(1);
  });

  it("aggregates pulled pork sandwich raw ingredients", () => {
    const node = resolveRecipeChain(itemId("pulled-pork-sandwich"))!;
    const raws = totalRawIngredients(node);
    const byId = Object.fromEntries(raws.map((r) => [r.itemId, r.quantity]));
    expect(byId["bun"]).toBe(1);
    expect(byId["pork-shoulder"]).toBe(1);
    expect(byId["cabbage"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// totalRecipeTime
// ---------------------------------------------------------------------------
describe("totalRecipeTime", () => {
  it("sums all step times for classic burger", () => {
    const node = resolveRecipeChain(itemId("classic-burger"))!;
    // beef-patty 3s + grilled-patty 5s + shredded-lettuce 2s + sliced-tomato 2s + assemble 0s = 12s
    expect(totalRecipeTime(node)).toBe(12_000);
  });

  it("sums all step times for pulled pork sandwich", () => {
    const node = resolveRecipeChain(itemId("pulled-pork-sandwich"))!;
    // seasoned-pork 3s + smoked-pork 8s + pulled-pork 3s + coleslaw 4s + assemble 0s = 18s
    expect(totalRecipeTime(node)).toBe(18_000);
  });

  it("single step has just its own time", () => {
    const node = resolveRecipeChain(itemId("shredded-lettuce"))!;
    expect(totalRecipeTime(node)).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Specific recipe spot-checks
// ---------------------------------------------------------------------------
describe("spot checks", () => {
  it("miso soup is a cook recipe (not assemble)", () => {
    const recipe = findRecipe(itemId("miso-soup"));
    expect(recipe).toBeDefined();
    expect(recipe!.method).toBe("cook");
    expect(recipe!.timeMs).toBe(5000);
  });

  it("sushi rice requires rice + rice-vinegar", () => {
    const recipe = findRecipe(itemId("sushi-rice"));
    expect(recipe).toBeDefined();
    expect(recipe!.inputs).toEqual([
      { itemId: "rice", quantity: 1 },
      { itemId: "rice-vinegar", quantity: 1 },
    ]);
  });

  it("bacon cheeseburger has 5 inputs", () => {
    const recipe = findRecipe(itemId("bacon-cheeseburger"));
    expect(recipe).toBeDefined();
    expect(recipe!.inputs.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Zone / interaction assignments
// ---------------------------------------------------------------------------
describe("zone and interaction assignments", () => {
  it("cutting board prep steps have zone=cuttingBoard, interaction=hold", () => {
    const cuttingBoardIds = [
      "shredded-lettuce", "sliced-tomato", "sliced-onion", "beef-patty",
      "cut-fries", "coleslaw", "seasoned-pork", "pulled-pork",
      "seasoned-ribs", "seasoned-brisket", "sliced-brisket",
      "seasoned-chicken", "rice-ball", "sliced-salmon", "sliced-tuna",
      "sliced-cucumber", "sliced-avocado", "cubed-tofu",
    ];
    cuttingBoardIds.forEach((id) => {
      const recipe = findRecipe(itemId(id));
      expect(recipe, `recipe for ${id}`).toBeDefined();
      expect((recipe as RecipeStep & { zone: KitchenZone }).zone, `zone for ${id}`).toBe("cuttingBoard");
      expect((recipe as RecipeStep & { interaction: ZoneInteraction }).interaction, `interaction for ${id}`).toBe("hold");
    });
  });

  it("stove flip steps have zone=stove, interaction=flip", () => {
    const stoveFlipIds = [
      "grilled-patty", "crispy-bacon", "french-fries",
      "grilled-chicken", "grilled-corn", "smoked-patty",
      "onion-rings", "tempura-shrimp",
    ];
    stoveFlipIds.forEach((id) => {
      const recipe = findRecipe(itemId(id));
      expect(recipe, `recipe for ${id}`).toBeDefined();
      expect((recipe as RecipeStep & { zone: KitchenZone }).zone, `zone for ${id}`).toBe("stove");
      expect((recipe as RecipeStep & { interaction: ZoneInteraction }).interaction, `interaction for ${id}`).toBe("flip");
    });
  });

  it("stove auto steps have zone=stove, interaction=auto", () => {
    const stoveAutoIds = ["sushi-rice", "miso-soup"];
    stoveAutoIds.forEach((id) => {
      const recipe = findRecipe(itemId(id));
      expect(recipe, `recipe for ${id}`).toBeDefined();
      expect((recipe as RecipeStep & { zone: KitchenZone }).zone, `zone for ${id}`).toBe("stove");
      expect((recipe as RecipeStep & { interaction: ZoneInteraction }).interaction, `interaction for ${id}`).toBe("auto");
    });
  });

  it("oven auto steps have zone=oven, interaction=auto", () => {
    const ovenIds = ["smoked-pork", "smoked-ribs", "smoked-brisket", "smoked-chicken"];
    ovenIds.forEach((id) => {
      const recipe = findRecipe(itemId(id));
      expect(recipe, `recipe for ${id}`).toBeDefined();
      expect((recipe as RecipeStep & { zone: KitchenZone }).zone, `zone for ${id}`).toBe("oven");
      expect((recipe as RecipeStep & { interaction: ZoneInteraction }).interaction, `interaction for ${id}`).toBe("auto");
    });
  });

  it("assemble steps have zone=undefined, interaction=undefined", () => {
    allRecipes()
      .filter((r) => r.method === "assemble")
      .forEach((r) => {
        expect((r as RecipeStep & { zone: unknown }).zone, `zone for ${r.id}`).toBeUndefined();
        expect((r as RecipeStep & { interaction: unknown }).interaction, `interaction for ${r.id}`).toBeUndefined();
      });
  });

  it("all prep/cook steps have defined zone and interaction", () => {
    allRecipes()
      .filter((r) => r.method === "prep" || r.method === "cook")
      .forEach((r) => {
        expect((r as RecipeStep & { zone: unknown }).zone, `zone for ${r.id}`).toBeDefined();
        expect((r as RecipeStep & { interaction: unknown }).interaction, `interaction for ${r.id}`).toBeDefined();
      });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("every recipe output has a corresponding item", () => {
    const recipes = allRecipes();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: recipes.length - 1 }),
        (index) => {
          const r = recipes[index];
          expect(findItem(r.output)).toBeDefined();
        }
      )
    );
  });

  it("every recipe input references a valid item", () => {
    const recipes = allRecipes();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: recipes.length - 1 }),
        (index) => {
          const r = recipes[index];
          r.inputs.forEach((input) => {
            expect(findItem(input.itemId)).toBeDefined();
          });
        }
      )
    );
  });

  it("flattenRecipeChain is topologically sorted (deps before dependents)", () => {
    const recipes = allRecipes();
    // Check a random selection of recipe chains
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: recipes.length - 1 }),
        (index) => {
          const r = recipes[index];
          const node = resolveRecipeChain(r.output);
          if (node === undefined) return; // raw item outputs won't resolve
          const steps = flattenRecipeChain(node);
          const ids = steps.map((s) => s.id);
          // For each step, all of its non-raw inputs must appear earlier
          steps.forEach((step, i) => {
            step.inputs.forEach((input) => {
              const inputRecipes = recipesForOutput(input.itemId);
              inputRecipes.forEach((ir) => {
                const depIndex = ids.indexOf(ir.id);
                expect(depIndex).toBeLessThan(i);
              });
            });
          });
        }
      )
    );
  });

  it("totalRawIngredients only returns raw-category items", () => {
    const recipes = allRecipes();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: recipes.length - 1 }),
        (index) => {
          const r = recipes[index];
          const node = resolveRecipeChain(r.output);
          if (node === undefined) return;
          const raws = totalRawIngredients(node);
          raws.forEach((ri) => {
            const item = findItem(ri.itemId)!;
            expect(item.category).toBe("raw");
          });
        }
      )
    );
  });

  it("totalRecipeTime is non-negative for all chains", () => {
    const recipes = allRecipes();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: recipes.length - 1 }),
        (index) => {
          const r = recipes[index];
          const node = resolveRecipeChain(r.output);
          if (node === undefined) return;
          expect(totalRecipeTime(node)).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});
