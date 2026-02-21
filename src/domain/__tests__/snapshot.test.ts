import { describe, it, expect } from "vitest";
import { snapshotSlotPatch } from "../snapshot";
import { createWallet } from "../wallet";
import { createDayCycle, advanceToKitchenPrep, advanceToService, advanceToDayEnd } from "../day-cycle";
import { createInventory, addItem } from "../inventory";
import { itemId } from "../branded";

describe("snapshotSlotPatch", () => {
  const wallet = createWallet(42);
  const inv = addItem(createInventory(), itemId("bun"), 1000);
  const now = 5000;

  it("builds correct patch for grocery phase", () => {
    const cycle = createDayCycle(3);
    const patch = snapshotSlotPatch(wallet, cycle, inv, now);

    expect(patch.day).toBe(3);
    expect(patch.coins).toBe(42);
    expect(patch.scene).toBe("GroceryScene");
    expect(patch.lastSaved).toBe(5000);
    expect(patch.phase).toEqual(cycle.phase);
    expect(patch.inventory).toEqual(inv);
  });

  it("builds correct patch for kitchen_prep phase", () => {
    const cycle = advanceToKitchenPrep(createDayCycle(2), 30_000);
    const patch = snapshotSlotPatch(wallet, cycle, inv, now);

    expect(patch.day).toBe(2);
    expect(patch.scene).toBe("KitchenScene");
    expect(patch.phase).toEqual(cycle.phase);
  });

  it("builds correct patch for service phase", () => {
    const cycle = advanceToService(createDayCycle(1), 120_000);
    const patch = snapshotSlotPatch(wallet, cycle, inv, now);

    expect(patch.day).toBe(1);
    expect(patch.scene).toBe("RestaurantScene");
    expect(patch.phase).toEqual(cycle.phase);
    expect(patch.inventory).toEqual(inv);
  });

  it("builds correct patch for day_end phase", () => {
    const cycle = advanceToDayEnd(advanceToService(createDayCycle(5), 120_000));
    const patch = snapshotSlotPatch(wallet, cycle, inv, now);

    expect(patch.day).toBe(5);
    expect(patch.scene).toBe("RestaurantScene");
    expect(patch.phase).toEqual(cycle.phase);
  });

  it("uses Date.now() when no timestamp provided", () => {
    const cycle = createDayCycle(1);
    const before = Date.now();
    const patch = snapshotSlotPatch(wallet, cycle, inv);
    const after = Date.now();

    expect(patch.lastSaved).toBeGreaterThanOrEqual(before);
    expect(patch.lastSaved).toBeLessThanOrEqual(after);
  });

  it("includes empty inventory", () => {
    const cycle = createDayCycle(1);
    const patch = snapshotSlotPatch(wallet, cycle, createInventory(), now);

    expect(patch.inventory).toEqual(createInventory());
  });
});
