import { describe, it, expect } from "vitest";
import { kitchenVM, type ActiveRecipe } from "../../view/kitchen-vm";
import { createInventory, addItem, type Inventory } from "../../inventory";
import { itemId } from "../../branded";
import { findRecipe } from "../../recipes";

describe("kitchenVM", () => {
  it("lists unlocked recipes for burger restaurant", () => {
    const vm = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    expect(vm.recipes.length).toBeGreaterThan(0);
    vm.recipes.forEach((r) => {
      expect(r.outputSpriteKey).toMatch(/^item-/);
      expect(r.inputs.length).toBeGreaterThan(0);
    });
  });

  it("marks recipes as craftable when ingredients are available", () => {
    const now = Date.now();
    // "grilled-patty" needs "beef-patty" x1
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("beef-patty"), now);

    const vm = kitchenVM(inv, "burger", 1, undefined, now);
    const pattyRecipe = vm.recipes.find((r) => r.stepId === "grilled-patty");
    expect(pattyRecipe).toBeDefined();
    expect(pattyRecipe!.canMake).toBe(true);
  });

  it("marks recipes as not craftable when ingredients are missing", () => {
    const vm = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    vm.recipes.forEach((r) => {
      expect(r.canMake).toBe(false);
    });
  });

  it("shows input requirements with have/need counts", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("beef-patty"), now);

    const vm = kitchenVM(inv, "burger", 1, undefined, now);
    const pattyRecipe = vm.recipes.find((r) => r.stepId === "grilled-patty");
    expect(pattyRecipe).toBeDefined();
    const beefInput = pattyRecipe!.inputs.find((i) => i.itemId === "beef-patty");
    expect(beefInput).toBeDefined();
    expect(beefInput!.have).toBe(1);
    expect(beefInput!.need).toBe(1);
    expect(beefInput!.isShort).toBe(false);
  });

  it("marks inputs as short when insufficient", () => {
    const vm = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    const pattyRecipe = vm.recipes.find((r) => r.stepId === "grilled-patty");
    expect(pattyRecipe).toBeDefined();
    const beefInput = pattyRecipe!.inputs.find((i) => i.itemId === "beef-patty");
    expect(beefInput).toBeDefined();
    expect(beefInput!.have).toBe(0);
    expect(beefInput!.isShort).toBe(true);
  });

  it("shows no active recipe when none is in progress", () => {
    const vm = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    expect(vm.activeRecipe).toBeUndefined();
  });

  it("computes active recipe progress fraction", () => {
    const step = findRecipe(itemId("grilled-patty"));
    expect(step).toBeDefined();
    const startedAt = 1000;
    const active: ActiveRecipe = { step: step!, startedAt };

    // Half done
    const vm = kitchenVM(createInventory(), "burger", 1, active, startedAt + step!.timeMs / 2);
    expect(vm.activeRecipe).toBeDefined();
    expect(vm.activeRecipe!.fraction).toBeCloseTo(0.5);
    expect(vm.activeRecipe!.outputName).toBe("Grilled Patty");
  });

  it("clamps active recipe fraction at 1", () => {
    const step = findRecipe(itemId("grilled-patty"));
    expect(step).toBeDefined();
    const active: ActiveRecipe = { step: step!, startedAt: 1000 };

    const vm = kitchenVM(createInventory(), "burger", 1, active, 1000 + step!.timeMs + 5000);
    expect(vm.activeRecipe!.fraction).toBe(1);
  });

  it("shows more recipes when more dishes are unlocked", () => {
    const vm1 = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    const vm5 = kitchenVM(createInventory(), "burger", 5, undefined, Date.now());
    expect(vm5.recipes.length).toBeGreaterThanOrEqual(vm1.recipes.length);
  });

  it("includes time in seconds for each recipe", () => {
    const vm = kitchenVM(createInventory(), "burger", 1, undefined, Date.now());
    vm.recipes.forEach((r) => {
      expect(r.timeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  it("includes recipe method", () => {
    const vm = kitchenVM(createInventory(), "burger", 5, undefined, Date.now());
    const methods = new Set(vm.recipes.map((r) => r.method));
    // Burger should have prep, cook, and assemble methods
    expect(methods.size).toBeGreaterThan(0);
  });
});
