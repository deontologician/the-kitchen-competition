import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createSaveSlot,
  createSaveStore,
  addSlot,
  serializeStore,
  deserializeStore,
} from "../save-slots";
import { slotId } from "../branded";
import { createWallet } from "../wallet";
import { createDayCycle } from "../day-cycle";
import { createInventory } from "../inventory";
import { unlockedDishIdsFor } from "../menu";
import { groceryVM } from "../view/grocery-vm";
import { kitchenVM } from "../view/kitchen-vm";
import { timerBarVM } from "../view/timer-vm";
import { inventoryVM } from "../view/inventory-vm";
import type { ItemId } from "../branded";

const restaurantTypeArb = fc.constantFrom(
  "sushi" as const,
  "bbq" as const,
  "burger" as const
);

const slotArb = fc
  .record({
    id: fc.uuid(),
    restaurantType: restaurantTypeArb,
    day: fc.integer({ min: 1, max: 999 }),
    coins: fc.nat(99999),
    unlockedDishes: fc.integer({ min: 1, max: 5 }),
    disableCount: fc.nat(2),
  })
  .map((r) => {
    const allDishIds = unlockedDishIdsFor(r.restaurantType, r.unlockedDishes);
    // Disable up to disableCount dishes, but always leave at least 1 enabled
    const maxDisable = Math.max(0, allDishIds.length - 1);
    const toDisable = Math.min(r.disableCount, maxDisable);
    const disabledDishes: ReadonlyArray<ItemId> | undefined =
      toDisable > 0 ? allDishIds.slice(0, toDisable) : undefined;

    return createSaveSlot(
      slotId(r.id),
      r.restaurantType,
      r.day,
      r.coins,
      "GroceryScene",
      Date.now(),
      r.unlockedDishes,
      disabledDishes
    );
  });

const computeVMs = (slot: ReturnType<typeof createSaveSlot>) => {
  const wallet = createWallet(slot.coins);
  const cycle = createDayCycle(slot.day);
  const inventory = createInventory();
  const disabled = slot.disabledDishes ?? [];

  return {
    grocery: groceryVM(wallet, inventory, slot.restaurantType, slot.unlockedDishes, disabled),
    kitchen: kitchenVM(inventory, slot.restaurantType, slot.unlockedDishes, undefined, 0, disabled),
    timer: timerBarVM(cycle.phase, cycle.day),
    inventory: inventoryVM(inventory, 0),
  };
};

describe("save/load roundtrip VM equivalence", () => {
  it("VMs computed from a loaded slot equal VMs from the original slot", () => {
    fc.assert(
      fc.property(slotArb, (slot) => {
        const before = computeVMs(slot);

        const json = serializeStore(addSlot(createSaveStore(), slot));
        const store = deserializeStore(json);
        expect(store).toBeDefined();
        const loaded = store!.slots[0];

        const after = computeVMs(loaded);

        expect(after.grocery).toEqual(before.grocery);
        expect(after.kitchen).toEqual(before.kitchen);
        expect(after.timer).toEqual(before.timer);
        expect(after.inventory).toEqual(before.inventory);
      })
    );
  });
});
