import type { CustomerId, ItemId } from "../branded";
import type { ServicePhase } from "../day-cycle";
import { activeCustomerId } from "../day-cycle";
import { findItem } from "../items";
import { countItem, type Inventory } from "../inventory";
import { unlockedMenuFor } from "../menu";
import type { RestaurantType } from "../save-slots";
import { patienceLevel } from "./format";

export type TableTint = "neutral" | "ok" | "warning" | "critical" | "active";

export interface TableVM {
  readonly tableId: number;
  readonly occupied: boolean;
  readonly customerId: CustomerId | undefined;
  readonly dishSpriteKey: string | undefined;
  readonly patienceFraction: number;
  readonly tint: TableTint;
  readonly showPatienceBar: boolean;
}

export type ActionPrompt =
  | { readonly tag: "waiting"; readonly message: string }
  | {
      readonly tag: "taking_order";
      readonly dishId: ItemId;
      readonly dishName: string;
      readonly dishSpriteKey: string;
      readonly sellPrice: number;
      readonly hasDish: boolean;
    }
  | { readonly tag: "cooking" }
  | {
      readonly tag: "serving";
      readonly dishId: ItemId;
      readonly dishName: string;
      readonly dishSpriteKey: string;
      readonly sellPrice: number;
      readonly hasDish: boolean;
    };

export interface RestaurantVM {
  readonly tables: ReadonlyArray<TableVM>;
  readonly actionPrompt: ActionPrompt;
}

const tintForPatience = (fraction: number): TableTint => {
  const level = patienceLevel(fraction);
  switch (level) {
    case "ok":
      return "ok";
    case "warning":
      return "warning";
    case "critical":
      return "critical";
  }
};

const getPriceForDish = (
  dishId: ItemId,
  restaurantType: RestaurantType,
  unlockedCount: number
): number => {
  const menu = unlockedMenuFor(restaurantType, unlockedCount);
  const menuItem = menu.items.find((mi) => mi.dishId === dishId);
  return menuItem?.sellPrice ?? 5;
};

export const restaurantVM = (
  phase: ServicePhase,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): RestaurantVM => {
  const activeId = activeCustomerId(phase);

  // Build customer lookup
  const customerMap = new Map<
    string,
    { patienceMs: number; maxPatienceMs: number; dishId: string }
  >();
  phase.customerQueue.forEach((c) => {
    customerMap.set(c.id, {
      patienceMs: c.patienceMs,
      maxPatienceMs: c.maxPatienceMs,
      dishId: c.dishId,
    });
  });

  // Get active dish id based on sub-phase
  let activeDishId: string | undefined;
  if (phase.subPhase.tag === "taking_order") {
    activeDishId = phase.subPhase.customer.dishId;
  } else if (
    phase.subPhase.tag === "cooking" ||
    phase.subPhase.tag === "serving"
  ) {
    activeDishId = phase.subPhase.order.dishId;
  }

  const tables: ReadonlyArray<TableVM> = phase.tableLayout.tables.map(
    (table) => {
      if (table.customerId === undefined) {
        return {
          tableId: table.id,
          occupied: false,
          customerId: undefined,
          dishSpriteKey: undefined,
          patienceFraction: 1,
          tint: "neutral" as const,
          showPatienceBar: false,
        };
      }

      const isActive = table.customerId === activeId;
      const customer = customerMap.get(table.customerId);
      const dishId = isActive ? activeDishId : customer?.dishId;
      const patienceFraction =
        customer !== undefined && customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;

      return {
        tableId: table.id,
        occupied: true,
        customerId: table.customerId as CustomerId,
        dishSpriteKey: dishId !== undefined ? `item-${dishId}` : undefined,
        patienceFraction,
        tint: isActive ? ("active" as const) : tintForPatience(patienceFraction),
        showPatienceBar: !isActive && customer !== undefined,
      };
    }
  );

  const actionPrompt = computeActionPrompt(
    phase,
    inventory,
    restaurantType,
    unlockedCount
  );

  return { tables, actionPrompt };
};

const computeActionPrompt = (
  phase: ServicePhase,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): ActionPrompt => {
  switch (phase.subPhase.tag) {
    case "waiting_for_customer": {
      const msg =
        phase.customerQueue.length > 0
          ? `${phase.customerQueue.length} in queue...`
          : "Waiting for customers...";
      return { tag: "waiting", message: msg };
    }
    case "taking_order": {
      const dishId = phase.subPhase.customer.dishId;
      const dishItem = findItem(dishId);
      return {
        tag: "taking_order",
        dishId,
        dishName: dishItem?.name ?? dishId,
        dishSpriteKey: `item-${dishId}`,
        sellPrice: getPriceForDish(dishId, restaurantType, unlockedCount),
        hasDish: countItem(inventory, dishId) > 0,
      };
    }
    case "cooking":
      return { tag: "cooking" };
    case "serving": {
      const dishId = phase.subPhase.order.dishId;
      const dishItem = findItem(dishId);
      return {
        tag: "serving",
        dishId,
        dishName: dishItem?.name ?? dishId,
        dishSpriteKey: `item-${dishId}`,
        sellPrice: getPriceForDish(dishId, restaurantType, unlockedCount),
        hasDish: countItem(inventory, dishId) > 0,
      };
    }
  }
};
