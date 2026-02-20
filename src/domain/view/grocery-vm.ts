import type { ItemId } from "../branded";
import type { RestaurantType } from "../restaurant-type";
import { findItem } from "../items";
import { canAfford, type Wallet } from "../wallet";
import { countItem, type Inventory } from "../inventory";
import { unlockedGroceryItemsFor } from "../menu";
import { truncateName } from "./format";

export interface GroceryItemVM {
  readonly itemId: ItemId;
  readonly name: string;
  readonly displayName: string;
  readonly cost: number;
  readonly count: number;
  readonly canAfford: boolean;
  readonly spriteKey: string;
}

export interface GroceryVM {
  readonly items: ReadonlyArray<GroceryItemVM>;
}

const GROCERY_NAME_MAX = 10;

export const groceryVM = (
  wallet: Wallet,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): GroceryVM => {
  const groceryIds = unlockedGroceryItemsFor(restaurantType, unlockedCount);

  const items = groceryIds
    .map((id) => {
      const item = findItem(id);
      if (item === undefined) return undefined;
      const cost = item.cost ?? 0;
      return {
        itemId: id,
        name: item.name,
        displayName: truncateName(item.name, GROCERY_NAME_MAX),
        cost,
        count: countItem(inventory, id),
        canAfford: canAfford(wallet, cost),
        spriteKey: `item-${id}`,
      };
    })
    .filter((item): item is GroceryItemVM => item !== undefined);

  return { items };
};
