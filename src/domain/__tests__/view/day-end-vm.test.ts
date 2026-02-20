import { describe, it, expect } from "vitest";
import { dayEndVM } from "../../view/day-end-vm";
import { createWallet } from "../../wallet";
import type { Phase } from "../../day-cycle";

const dayEnd = (
  customersServed: number,
  customersLost: number,
  earnings: number
): Extract<Phase, { readonly tag: "day_end" }> => ({
  tag: "day_end",
  customersServed,
  customersLost,
  earnings,
});

describe("dayEndVM", () => {
  it("computes basic summary", () => {
    const vm = dayEndVM(dayEnd(5, 1, 25), 3, createWallet(10), "burger", 1);
    expect(vm.day).toBe(3);
    expect(vm.customersServed).toBe(5);
    expect(vm.customersLost).toBe(1);
    expect(vm.earnings).toBe(25);
    expect(vm.newTotalCoins).toBe(35); // 10 + 25
  });

  it("returns no dish unlock when customers were lost", () => {
    const vm = dayEndVM(dayEnd(5, 1, 25), 1, createWallet(10), "burger", 1);
    expect(vm.dishUnlock).toBeUndefined();
  });

  it("returns no dish unlock when coins are zero", () => {
    const vm = dayEndVM(dayEnd(5, 0, 0), 1, createWallet(0), "burger", 1);
    expect(vm.dishUnlock).toBeUndefined();
  });

  it("returns dish unlock when 0 lost and coins > 0", () => {
    const vm = dayEndVM(dayEnd(5, 0, 25), 1, createWallet(10), "burger", 1);
    expect(vm.dishUnlock).toBeDefined();
    expect(vm.dishUnlock!.newUnlockedCount).toBe(2);
    // The newly unlocked dish should be the 2nd burger dish: cheeseburger
    expect(vm.dishUnlock!.dishId).toBe("cheeseburger");
    expect(vm.dishUnlock!.dishName).toBe("Cheeseburger");
    expect(vm.dishUnlock!.dishSpriteKey).toBe("item-cheeseburger");
  });

  it("returns no dish unlock when all dishes are unlocked", () => {
    const vm = dayEndVM(dayEnd(5, 0, 25), 1, createWallet(10), "burger", 5);
    expect(vm.dishUnlock).toBeUndefined();
  });

  it("returns correct unlock for bbq", () => {
    const vm = dayEndVM(dayEnd(3, 0, 15), 2, createWallet(20), "bbq", 1);
    expect(vm.dishUnlock).toBeDefined();
    // 2nd bbq dish: smoked-chicken-plate
    expect(vm.dishUnlock!.dishId).toBe("smoked-chicken-plate");
    expect(vm.dishUnlock!.newUnlockedCount).toBe(2);
  });

  it("returns correct unlock for sushi", () => {
    const vm = dayEndVM(dayEnd(3, 0, 15), 2, createWallet(20), "sushi", 1);
    expect(vm.dishUnlock).toBeDefined();
    // 2nd sushi dish: miso-soup
    expect(vm.dishUnlock!.dishId).toBe("miso-soup");
    expect(vm.dishUnlock!.newUnlockedCount).toBe(2);
  });

  it("new total coins includes earnings", () => {
    const vm = dayEndVM(dayEnd(10, 0, 50), 1, createWallet(100), "burger", 1);
    expect(vm.newTotalCoins).toBe(150);
  });
});
