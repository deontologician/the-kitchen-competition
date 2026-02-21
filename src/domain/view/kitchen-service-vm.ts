import type { OrderId, ItemId } from "../branded";
import type {
  KitchenServiceState,
  KitchenOrder,
  CuttingBoardStation,
  PassiveStation,
} from "../kitchen-service";
import { findItem } from "../items";

// ---------------------------------------------------------------------------
// Station VM
// ---------------------------------------------------------------------------

export interface StationVM {
  readonly tag: "idle" | "working" | "done";
  readonly progressFraction: number;
  readonly dishName: string | undefined;
  readonly dishSpriteKey: string | undefined;
  readonly orderId: OrderId | undefined;
  readonly isPlayerActive?: boolean; // only for cutting board
}

export interface KitchenOrderVM {
  readonly orderId: OrderId;
  readonly dishId: ItemId;
  readonly dishName: string;
  readonly dishSpriteKey: string;
}

export interface KitchenServiceVM {
  readonly pendingOrders: ReadonlyArray<KitchenOrderVM>;
  readonly cuttingBoard: StationVM;
  readonly stove: StationVM;
  readonly oven: StationVM;
  readonly orderUp: ReadonlyArray<KitchenOrderVM>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const orderVM = (order: KitchenOrder): KitchenOrderVM => {
  const item = findItem(order.dishId);
  return {
    orderId: order.id,
    dishId: order.dishId,
    dishName: item?.name ?? order.dishId,
    dishSpriteKey: `item-${order.dishId}`,
  };
};

const cuttingBoardVM = (station: CuttingBoardStation): StationVM => {
  switch (station.tag) {
    case "idle":
      return {
        tag: "idle",
        progressFraction: 0,
        dishName: undefined,
        dishSpriteKey: undefined,
        orderId: undefined,
        isPlayerActive: false,
      };
    case "working": {
      const item = findItem(station.order.dishId);
      return {
        tag: "working",
        progressFraction:
          station.durationMs > 0
            ? Math.min(1, station.progressMs / station.durationMs)
            : 0,
        dishName: item?.name ?? station.order.dishId,
        dishSpriteKey: `item-${station.order.dishId}`,
        orderId: station.order.id,
        isPlayerActive: station.isPlayerActive,
      };
    }
    case "done": {
      const item = findItem(station.order.dishId);
      return {
        tag: "done",
        progressFraction: 1,
        dishName: item?.name ?? station.order.dishId,
        dishSpriteKey: `item-${station.order.dishId}`,
        orderId: station.order.id,
        isPlayerActive: false,
      };
    }
    default: {
      const _exhaustive: never = station;
      return _exhaustive;
    }
  }
};

const passiveStationVM = (station: PassiveStation): StationVM => {
  switch (station.tag) {
    case "idle":
      return {
        tag: "idle",
        progressFraction: 0,
        dishName: undefined,
        dishSpriteKey: undefined,
        orderId: undefined,
      };
    case "working": {
      const item = findItem(station.order.dishId);
      return {
        tag: "working",
        progressFraction:
          station.durationMs > 0
            ? Math.min(1, station.progressMs / station.durationMs)
            : 0,
        dishName: item?.name ?? station.order.dishId,
        dishSpriteKey: `item-${station.order.dishId}`,
        orderId: station.order.id,
      };
    }
    case "done": {
      const item = findItem(station.order.dishId);
      return {
        tag: "done",
        progressFraction: 1,
        dishName: item?.name ?? station.order.dishId,
        dishSpriteKey: `item-${station.order.dishId}`,
        orderId: station.order.id,
      };
    }
    default: {
      const _exhaustive: never = station;
      return _exhaustive;
    }
  }
};

// ---------------------------------------------------------------------------
// Main VM function
// ---------------------------------------------------------------------------

export const kitchenServiceVM = (
  kitchen: KitchenServiceState
): KitchenServiceVM => ({
  pendingOrders: kitchen.pendingOrders.map(orderVM),
  cuttingBoard: cuttingBoardVM(kitchen.cuttingBoard),
  stove: passiveStationVM(kitchen.stove),
  oven: passiveStationVM(kitchen.oven),
  orderUp: kitchen.orderUp.map(orderVM),
});
