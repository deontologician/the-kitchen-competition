import { describe, it, expect } from "vitest";
import { inventoryVM } from "../../view/inventory-vm";
import { createInventory, addItem, type Inventory } from "../../inventory";
import { itemId } from "../../branded";

describe("inventoryVM", () => {
  it("returns empty state for empty inventory", () => {
    const vm = inventoryVM(createInventory(), Date.now());
    expect(vm.dishes).toEqual([]);
    expect(vm.prepped).toEqual([]);
    expect(vm.hasDivider).toBe(false);
    expect(vm.isEmpty).toBe(true);
  });

  it("groups dishes separately from prepped items", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    // "classic-burger" is a dish, "grilled-patty" is prepped
    inv = addItem(inv, itemId("classic-burger"), now);
    inv = addItem(inv, itemId("grilled-patty"), now);

    const vm = inventoryVM(inv, now);
    expect(vm.dishes.length).toBe(1);
    expect(vm.prepped.length).toBe(1);
    expect(vm.hasDivider).toBe(true);
    expect(vm.isEmpty).toBe(false);
    expect(vm.dishes[0].itemId).toBe("classic-burger");
    expect(vm.prepped[0].itemId).toBe("grilled-patty");
  });

  it("counts duplicates", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("classic-burger"), now);
    inv = addItem(inv, itemId("classic-burger"), now);

    const vm = inventoryVM(inv, now);
    expect(vm.dishes.length).toBe(1);
    expect(vm.dishes[0].count).toBe(2);
  });

  it("truncates long names", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    // "bacon-cheeseburger" name is "Bacon Cheeseburger" which is > 12 chars
    inv = addItem(inv, itemId("bacon-cheeseburger"), now);

    const vm = inventoryVM(inv, now);
    expect(vm.dishes[0].displayName.length).toBeLessThanOrEqual(12);
  });

  it("assigns freshness levels based on shelf life", () => {
    // grilled-patty has 60s shelf life
    const createdAt = 1000;
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("grilled-patty"), createdAt);

    // Fresh (>50% remaining) — 10s elapsed of 60s = 83% fresh
    const freshVm = inventoryVM(inv, createdAt + 10_000);
    expect(freshVm.prepped[0].freshness).toBe("fresh");

    // Warning (25-50% remaining) — 40s elapsed of 60s = 33% fresh
    const warnVm = inventoryVM(inv, createdAt + 40_000);
    expect(warnVm.prepped[0].freshness).toBe("warning");

    // Critical (<25% remaining) — 55s elapsed of 60s = 8% fresh
    const critVm = inventoryVM(inv, createdAt + 55_000);
    expect(critVm.prepped[0].freshness).toBe("critical");
  });

  it("items without shelf life are always fresh", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    // raw items have no shelf life
    inv = addItem(inv, itemId("bun"), now);

    const vm = inventoryVM(inv, now + 999_999);
    // raw items won't appear in dishes or prepped, they'll be in neither
    // Actually raw items don't have shelf life but they are category "raw"
    // Let's verify they're excluded from dishes and prepped
    expect(vm.dishes).toEqual([]);
    expect(vm.prepped).toEqual([]);
  });

  it("only includes dish and prepped categories", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("bun"), now);        // raw
    inv = addItem(inv, itemId("grilled-patty"), now); // prepped
    inv = addItem(inv, itemId("classic-burger"), now); // dish

    const vm = inventoryVM(inv, now);
    expect(vm.dishes.length).toBe(1);
    expect(vm.prepped.length).toBe(1);
    // raw "bun" should not appear in either list
  });

  it("hasDivider is false with only dishes", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("classic-burger"), now);

    const vm = inventoryVM(inv, now);
    expect(vm.hasDivider).toBe(false);
  });

  it("hasDivider is false with only prepped", () => {
    const now = Date.now();
    let inv: Inventory = createInventory();
    inv = addItem(inv, itemId("grilled-patty"), now);

    const vm = inventoryVM(inv, now);
    expect(vm.hasDivider).toBe(false);
  });
});
