import { findItem } from "./items";
import type { RecipeStep } from "./recipes";

export interface InventoryItem {
  readonly itemId: string;
  readonly createdAt: number;
}

export interface Inventory {
  readonly items: ReadonlyArray<InventoryItem>;
}

export const createInventory = (): Inventory => ({ items: [] });

export const addItem = (
  inv: Inventory,
  itemId: string,
  createdAt: number
): Inventory => ({
  items: [...inv.items, { itemId, createdAt }],
});

export const addItems = (
  inv: Inventory,
  itemId: string,
  quantity: number,
  createdAt: number
): Inventory => ({
  items: [
    ...inv.items,
    ...Array.from({ length: quantity }, () => ({ itemId, createdAt })),
  ],
});

export const countItem = (inv: Inventory, itemId: string): number =>
  inv.items.filter((i) => i.itemId === itemId).length;

export const itemCounts = (
  inv: Inventory
): ReadonlyArray<{ readonly itemId: string; readonly count: number }> => {
  const map = new Map<string, number>();
  inv.items.forEach((i) => {
    map.set(i.itemId, (map.get(i.itemId) ?? 0) + 1);
  });
  return [...map.entries()].map(([itemId, count]) => ({ itemId, count }));
};

export const removeItems = (
  inv: Inventory,
  itemId: string,
  quantity: number
): Inventory | undefined => {
  const matching = inv.items.filter((i) => i.itemId === itemId);
  if (matching.length < quantity) return undefined;

  // FIFO: find original indices of the oldest N matching items
  const sortedAll = inv.items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter((e) => e.item.itemId === itemId)
    .sort((a, b) => a.item.createdAt - b.item.createdAt);

  const indicesToRemove = new Set(
    sortedAll.slice(0, quantity).map((e) => e.originalIndex)
  );

  return {
    items: inv.items.filter((_, idx) => !indicesToRemove.has(idx)),
  };
};

export const removeItemSet = (
  inv: Inventory,
  requirements: ReadonlyArray<{ readonly itemId: string; readonly quantity: number }>
): Inventory | undefined => {
  let current: Inventory = inv;
  for (const req of requirements) {
    const next = removeItems(current, req.itemId, req.quantity);
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
};

export const removeExpired = (
  inv: Inventory,
  currentTimeMs: number
): Inventory => ({
  items: inv.items.filter((item) => {
    const def = findItem(item.itemId);
    if (def === undefined || def.shelfLifeMs === undefined) return true;
    return item.createdAt + def.shelfLifeMs > currentTimeMs;
  }),
});

export interface ItemFreshness {
  readonly itemId: string;
  readonly freshness: number; // 0..1, where 1 = fully fresh, 0 = expired
}

export const itemFreshness = (
  inv: Inventory,
  currentTimeMs: number
): ReadonlyArray<ItemFreshness> => {
  const minMap = new Map<string, number>();
  inv.items.forEach((item) => {
    const def = findItem(item.itemId);
    const freshness =
      def === undefined || def.shelfLifeMs === undefined
        ? 1
        : Math.max(0, (item.createdAt + def.shelfLifeMs - currentTimeMs) / def.shelfLifeMs);
    const prev = minMap.get(item.itemId);
    if (prev === undefined || freshness < prev) {
      minMap.set(item.itemId, freshness);
    }
  });
  return [...minMap.entries()].map(([itemId, freshness]) => ({ itemId, freshness }));
};

export const hasIngredientsFor = (
  inv: Inventory,
  step: RecipeStep
): boolean =>
  step.inputs.every(
    (input) => countItem(inv, input.itemId) >= input.quantity
  );

export const executeRecipeStep = (
  inv: Inventory,
  step: RecipeStep,
  currentTimeMs: number
): Inventory | undefined => {
  const afterRemoval = removeItemSet(inv, step.inputs);
  if (afterRemoval === undefined) return undefined;
  return addItem(afterRemoval, step.output, currentTimeMs);
};
