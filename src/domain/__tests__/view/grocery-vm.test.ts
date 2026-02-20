import { describe, it, expect } from "vitest";
import { groceryVM } from "../../view/grocery-vm";
import { createWallet, createWallet as wallet } from "../../wallet";
import { createInventory, addItem, type Inventory } from "../../inventory";
import { itemId } from "../../branded";

describe("groceryVM", () => {
  it("lists grocery items for burger restaurant", () => {
    const vm = groceryVM(createWallet(20), createInventory(), "burger", 1);
    expect(vm.items.length).toBeGreaterThan(0);
    // All items should be raw ingredients
    vm.items.forEach((item) => {
      expect(item.cost).toBeGreaterThan(0);
      expect(item.spriteKey).toBe(`item-${item.itemId}`);
    });
  });

  it("reflects inventory counts", () => {
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("bun"), Date.now());
    inv = addItem(inv, itemId("bun"), Date.now());

    const vm = groceryVM(createWallet(20), inv, "burger", 1);
    const bunItem = vm.items.find((i) => i.itemId === "bun");
    expect(bunItem).toBeDefined();
    expect(bunItem!.count).toBe(2);
  });

  it("marks items as unaffordable when wallet is empty", () => {
    const vm = groceryVM(createWallet(0), createInventory(), "burger", 1);
    vm.items.forEach((item) => {
      expect(item.canAfford).toBe(false);
    });
  });

  it("marks items as affordable when wallet has enough", () => {
    const vm = groceryVM(createWallet(20), createInventory(), "burger", 1);
    // All burger raw items cost 1-2, so with 20 coins all are affordable
    vm.items.forEach((item) => {
      expect(item.canAfford).toBe(true);
    });
  });

  it("truncates long item names", () => {
    const vm = groceryVM(createWallet(20), createInventory(), "burger", 5);
    vm.items.forEach((item) => {
      expect(item.displayName.length).toBeLessThanOrEqual(10);
    });
  });

  it("shows more items when more dishes are unlocked", () => {
    const vm1 = groceryVM(createWallet(20), createInventory(), "burger", 1);
    const vm5 = groceryVM(createWallet(20), createInventory(), "burger", 5);
    expect(vm5.items.length).toBeGreaterThanOrEqual(vm1.items.length);
  });

  it("works for all restaurant types", () => {
    const types = ["burger", "bbq", "sushi"] as const;
    types.forEach((type) => {
      const vm = groceryVM(createWallet(20), createInventory(), type, 1);
      expect(vm.items.length).toBeGreaterThan(0);
    });
  });

  it("includes item name from item definition", () => {
    const vm = groceryVM(createWallet(20), createInventory(), "burger", 1);
    const bunItem = vm.items.find((i) => i.itemId === "bun");
    expect(bunItem).toBeDefined();
    expect(bunItem!.name).toBe("Bun");
  });
});
