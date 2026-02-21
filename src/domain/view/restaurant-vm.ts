import type { CustomerId, ItemId, OrderId } from "../branded";
import type { ServicePhase, TableState } from "../day-cycle";
import { findItem } from "../items";
import { countItem, type Inventory } from "../inventory";
import { unlockedMenuFor } from "../menu";
import type { RestaurantType } from "../restaurant-type";
import { patienceLevel } from "./format";

export type TableTint = "neutral" | "ok" | "warning" | "critical" | "active";

/** Per-table action the player can take. */
export type TableAction = "take_order" | "send_to_kitchen" | "serve";

export interface TableVM {
  readonly tableId: number;
  readonly occupied: boolean;
  readonly customerId: CustomerId | undefined;
  readonly dishSpriteKey: string | undefined;
  readonly patienceFraction: number;
  readonly tint: TableTint;
  readonly showPatienceBar: boolean;
  readonly action: TableAction | undefined;
  readonly tableState: TableState;
}

export interface RestaurantVM {
  readonly tables: ReadonlyArray<TableVM>;
  /** Count of orders ready for pickup in kitchen.orderUp. */
  readonly kitchenBadge: number;
  readonly playerLocation: "floor" | "kitchen";
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

const actionForTableState = (
  state: TableState,
  inventory: Inventory
): TableAction | undefined => {
  switch (state.tag) {
    case "empty":
    case "in_kitchen":
    case "ready_to_serve":
      // ready_to_serve action: show "serve" only if dish in inventory
      if (state.tag === "ready_to_serve") return "serve";
      return undefined;
    case "customer_waiting":
      return "take_order";
    case "order_pending": {
      // Can send to kitchen (dish may or may not be available)
      return "send_to_kitchen";
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};

const tableVMFromState = (
  tableId: number,
  state: TableState,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): TableVM => {
  switch (state.tag) {
    case "empty":
      return {
        tableId,
        occupied: false,
        customerId: undefined,
        dishSpriteKey: undefined,
        patienceFraction: 1,
        tint: "neutral",
        showPatienceBar: false,
        action: undefined,
        tableState: state,
      };
    case "customer_waiting": {
      const { customer } = state;
      const fraction =
        customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;
      return {
        tableId,
        occupied: true,
        customerId: customer.id as CustomerId,
        dishSpriteKey: `item-${customer.dishId}`,
        patienceFraction: fraction,
        tint: tintForPatience(fraction),
        showPatienceBar: true,
        action: "take_order",
        tableState: state,
      };
    }
    case "order_pending": {
      const { customer } = state;
      const fraction =
        customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;
      return {
        tableId,
        occupied: true,
        customerId: customer.id as CustomerId,
        dishSpriteKey: `item-${customer.dishId}`,
        patienceFraction: fraction,
        tint: tintForPatience(fraction),
        showPatienceBar: true,
        action: "send_to_kitchen",
        tableState: state,
      };
    }
    case "in_kitchen": {
      const { customer } = state;
      const fraction =
        customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;
      return {
        tableId,
        occupied: true,
        customerId: customer.id as CustomerId,
        dishSpriteKey: `item-${customer.dishId}`,
        patienceFraction: fraction,
        tint: tintForPatience(fraction),
        showPatienceBar: true,
        action: undefined,
        tableState: state,
      };
    }
    case "ready_to_serve": {
      const { customer } = state;
      const fraction =
        customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;
      const hasDish = countItem(inventory, customer.dishId) > 0;
      return {
        tableId,
        occupied: true,
        customerId: customer.id as CustomerId,
        dishSpriteKey: `item-${customer.dishId}`,
        patienceFraction: fraction,
        tint: "active",
        showPatienceBar: false,
        action: "serve",
        tableState: state,
      };
    }
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};

export const restaurantVM = (
  phase: ServicePhase,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): RestaurantVM => {
  const tables = phase.tables.map((state, i) =>
    tableVMFromState(i, state, inventory, restaurantType, unlockedCount)
  );

  return {
    tables,
    kitchenBadge: phase.kitchen.orderUp.length,
    playerLocation: phase.playerLocation,
  };
};

/** Get dish info for a ready_to_serve table's order (for scene rendering). */
export interface ServingInfo {
  readonly dishId: ItemId;
  readonly dishName: string;
  readonly dishSpriteKey: string;
  readonly sellPrice: number;
  readonly hasDish: boolean;
  readonly orderId: OrderId;
  readonly customerId: CustomerId;
}

export const getServingInfo = (
  phase: ServicePhase,
  tableId: number,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): ServingInfo | undefined => {
  const state = phase.tables[tableId];
  if (state === undefined || state.tag !== "ready_to_serve") return undefined;
  const dishId = state.customer.dishId;
  const dishItem = findItem(dishId);
  return {
    dishId,
    dishName: dishItem?.name ?? dishId,
    dishSpriteKey: `item-${dishId}`,
    sellPrice: getPriceForDish(dishId, restaurantType, unlockedCount),
    hasDish: countItem(inventory, dishId) > 0,
    orderId: state.orderId,
    customerId: state.customer.id as CustomerId,
  };
};

/** Get dish info for an order_pending table (for scene rendering before sending to kitchen). */
export interface OrderPendingInfo {
  readonly dishId: ItemId;
  readonly dishName: string;
  readonly dishSpriteKey: string;
  readonly sellPrice: number;
  readonly hasDish: boolean;
  readonly customerId: CustomerId;
}

export const getOrderPendingInfo = (
  phase: ServicePhase,
  tableId: number,
  inventory: Inventory,
  restaurantType: RestaurantType,
  unlockedCount: number
): OrderPendingInfo | undefined => {
  const state = phase.tables[tableId];
  if (state === undefined || state.tag !== "order_pending") return undefined;
  const dishId = state.customer.dishId;
  const dishItem = findItem(dishId);
  return {
    dishId,
    dishName: dishItem?.name ?? dishId,
    dishSpriteKey: `item-${dishId}`,
    sellPrice: getPriceForDish(dishId, restaurantType, unlockedCount),
    hasDish: countItem(inventory, dishId) > 0,
    customerId: state.customer.id as CustomerId,
  };
};
