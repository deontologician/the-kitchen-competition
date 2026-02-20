import type { ItemId } from "../branded";
import type { Phase } from "../day-cycle";
import { addCoins, type Wallet } from "../wallet";
import { findItem } from "../items";
import type { RestaurantType } from "../save-slots";
import { shouldUnlockNextDish, unlockedDishIdsFor } from "../menu";

type DayEndPhase = Extract<Phase, { readonly tag: "day_end" }>;

export interface DishUnlockVM {
  readonly dishId: ItemId;
  readonly dishName: string;
  readonly dishSpriteKey: string;
  readonly newUnlockedCount: number;
}

export interface DayEndVM {
  readonly day: number;
  readonly customersServed: number;
  readonly customersLost: number;
  readonly earnings: number;
  readonly newTotalCoins: number;
  readonly dishUnlock: DishUnlockVM | undefined;
}

export const dayEndVM = (
  phase: DayEndPhase,
  day: number,
  wallet: Wallet,
  restaurantType: RestaurantType,
  currentUnlocked: number
): DayEndVM => {
  const newWallet = addCoins(wallet, phase.earnings);
  const newUnlocked = shouldUnlockNextDish(
    phase.customersLost,
    newWallet.coins,
    currentUnlocked
  );
  const didUnlock = newUnlocked > currentUnlocked;

  let dishUnlock: DishUnlockVM | undefined;
  if (didUnlock) {
    const newDishIds = unlockedDishIdsFor(restaurantType, newUnlocked);
    const newDishId = newDishIds[newDishIds.length - 1];
    const dishItem = findItem(newDishId);
    dishUnlock = {
      dishId: newDishId,
      dishName: dishItem?.name ?? newDishId,
      dishSpriteKey: `item-${newDishId}`,
      newUnlockedCount: newUnlocked,
    };
  }

  return {
    day,
    customersServed: phase.customersServed,
    customersLost: phase.customersLost,
    earnings: phase.earnings,
    newTotalCoins: newWallet.coins,
    dishUnlock,
  };
};
