import type { ItemId } from "../branded";
import { findItem } from "../items";
import { itemCounts, itemFreshness, type Inventory } from "../inventory";
import { truncateName, freshnessLevel, type FreshnessLevel } from "./format";

export interface InventoryItemVM {
  readonly itemId: ItemId;
  readonly displayName: string;
  readonly count: number;
  readonly freshness: FreshnessLevel;
}

export interface InventoryVM {
  readonly dishes: ReadonlyArray<InventoryItemVM>;
  readonly prepped: ReadonlyArray<InventoryItemVM>;
  readonly hasDivider: boolean;
  readonly isEmpty: boolean;
}

const DISPLAY_NAME_MAX = 12;

export const inventoryVM = (
  inventory: Inventory,
  now: number
): InventoryVM => {
  const counts = itemCounts(inventory);
  const freshMap = new Map<string, number>();
  itemFreshness(inventory, now).forEach((f) =>
    freshMap.set(f.itemId, f.freshness)
  );

  const toVM = (entry: {
    readonly itemId: ItemId;
    readonly count: number;
  }): InventoryItemVM | undefined => {
    const item = findItem(entry.itemId);
    if (item === undefined) return undefined;
    if (item.category !== "dish" && item.category !== "prepped") return undefined;

    return {
      itemId: entry.itemId,
      displayName: truncateName(item.name, DISPLAY_NAME_MAX),
      count: entry.count,
      freshness: freshnessLevel(freshMap.get(entry.itemId) ?? 1),
    };
  };

  const allVMs = counts
    .map(toVM)
    .filter((vm): vm is InventoryItemVM => vm !== undefined);

  const dishes = allVMs.filter((vm) => {
    const item = findItem(vm.itemId);
    return item !== undefined && item.category === "dish";
  });

  const prepped = allVMs.filter((vm) => {
    const item = findItem(vm.itemId);
    return item !== undefined && item.category === "prepped";
  });

  return {
    dishes,
    prepped,
    hasDivider: dishes.length > 0 && prepped.length > 0,
    isEmpty: dishes.length === 0 && prepped.length === 0,
  };
};
