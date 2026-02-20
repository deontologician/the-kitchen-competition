import type { ItemId } from "../branded";
import { findItem, type ItemCategory } from "../items";
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

interface TaggedVM extends InventoryItemVM {
  readonly category: ItemCategory;
}

export const inventoryVM = (
  inventory: Inventory,
  now: number
): InventoryVM => {
  const counts = itemCounts(inventory);
  const freshMap = new Map<string, number>();
  itemFreshness(inventory, now).forEach((f) =>
    freshMap.set(f.itemId, f.freshness)
  );

  const tagged = counts
    .map((entry): TaggedVM | undefined => {
      const item = findItem(entry.itemId);
      if (item === undefined) return undefined;
      if (item.category !== "dish" && item.category !== "prepped") return undefined;
      return {
        itemId: entry.itemId,
        displayName: truncateName(item.name, DISPLAY_NAME_MAX),
        count: entry.count,
        freshness: freshnessLevel(freshMap.get(entry.itemId) ?? 1),
        category: item.category,
      };
    })
    .filter((vm): vm is TaggedVM => vm !== undefined);

  const dishes = tagged.filter((vm) => vm.category === "dish");
  const prepped = tagged.filter((vm) => vm.category === "prepped");

  return {
    dishes,
    prepped,
    hasDivider: dishes.length > 0 && prepped.length > 0,
    isEmpty: dishes.length === 0 && prepped.length === 0,
  };
};
