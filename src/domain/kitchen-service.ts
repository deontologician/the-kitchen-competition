import type { OrderId, ItemId } from "./branded";

// Re-export Order interface is defined in day-cycle, but to avoid circular
// deps we define a minimal Order shape here.
export interface KitchenOrder {
  readonly id: OrderId;
  readonly customerId: string;
  readonly dishId: ItemId;
}

// ---------------------------------------------------------------------------
// Station types
// ---------------------------------------------------------------------------

export type CuttingBoardStation =
  | { readonly tag: "idle" }
  | {
      readonly tag: "working";
      readonly order: KitchenOrder;
      readonly progressMs: number;
      readonly durationMs: number;
      readonly isPlayerActive: boolean;
    }
  | { readonly tag: "done"; readonly order: KitchenOrder };

export type PassiveStation =
  | { readonly tag: "idle" }
  | {
      readonly tag: "working";
      readonly order: KitchenOrder;
      readonly progressMs: number;
      readonly durationMs: number;
    }
  | { readonly tag: "done"; readonly order: KitchenOrder };

export type PassiveStationName = "stove" | "oven";

export interface KitchenServiceState {
  readonly pendingOrders: ReadonlyArray<KitchenOrder>;
  readonly cuttingBoard: CuttingBoardStation;
  readonly stove: PassiveStation;
  readonly oven: PassiveStation;
  readonly orderUp: ReadonlyArray<KitchenOrder>;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const createKitchenServiceState = (): KitchenServiceState => ({
  pendingOrders: [],
  cuttingBoard: { tag: "idle" },
  stove: { tag: "idle" },
  oven: { tag: "idle" },
  orderUp: [],
});

// ---------------------------------------------------------------------------
// Order management
// ---------------------------------------------------------------------------

export const addOrderToKitchen = (
  kitchen: KitchenServiceState,
  order: KitchenOrder
): KitchenServiceState => ({
  ...kitchen,
  pendingOrders: [...kitchen.pendingOrders, order],
});

export const pickupFromOrderUp = (
  kitchen: KitchenServiceState,
  orderId: OrderId
): KitchenServiceState => ({
  ...kitchen,
  orderUp: kitchen.orderUp.filter((o) => o.id !== orderId),
});

// ---------------------------------------------------------------------------
// Station assignment
// ---------------------------------------------------------------------------

export const startCuttingBoardWork = (
  kitchen: KitchenServiceState,
  orderId: OrderId,
  durationMs: number
): KitchenServiceState => {
  const order = kitchen.pendingOrders.find((o) => o.id === orderId);
  if (order === undefined) return kitchen;
  if (kitchen.cuttingBoard.tag !== "idle") return kitchen;
  return {
    ...kitchen,
    pendingOrders: kitchen.pendingOrders.filter((o) => o.id !== orderId),
    cuttingBoard: {
      tag: "working",
      order,
      progressMs: 0,
      durationMs,
      isPlayerActive: false,
    },
  };
};

export const setPlayerAtCuttingBoard = (
  kitchen: KitchenServiceState,
  active: boolean
): KitchenServiceState => {
  if (kitchen.cuttingBoard.tag !== "working") return kitchen;
  return {
    ...kitchen,
    cuttingBoard: { ...kitchen.cuttingBoard, isPlayerActive: active },
  };
};

export const startPassiveStation = (
  kitchen: KitchenServiceState,
  station: PassiveStationName,
  orderId: OrderId,
  durationMs: number
): KitchenServiceState => {
  const order = kitchen.pendingOrders.find((o) => o.id === orderId);
  if (order === undefined) return kitchen;
  if (kitchen[station].tag !== "idle") return kitchen;
  return {
    ...kitchen,
    pendingOrders: kitchen.pendingOrders.filter((o) => o.id !== orderId),
    [station]: {
      tag: "working",
      order,
      progressMs: 0,
      durationMs,
    },
  };
};

// ---------------------------------------------------------------------------
// Ticking
// ---------------------------------------------------------------------------

const tickCuttingBoard = (
  station: CuttingBoardStation,
  delta: number
): { station: CuttingBoardStation; completed: KitchenOrder | undefined } => {
  if (station.tag !== "working") return { station, completed: undefined };
  if (!station.isPlayerActive) return { station, completed: undefined };
  const newProgress = station.progressMs + delta;
  if (newProgress >= station.durationMs) {
    return {
      station: { tag: "idle" },
      completed: station.order,
    };
  }
  return {
    station: { ...station, progressMs: newProgress },
    completed: undefined,
  };
};

const tickPassive = (
  station: PassiveStation,
  delta: number
): { station: PassiveStation; completed: KitchenOrder | undefined } => {
  if (station.tag !== "working") return { station, completed: undefined };
  const newProgress = station.progressMs + delta;
  if (newProgress >= station.durationMs) {
    return {
      station: { tag: "idle" },
      completed: station.order,
    };
  }
  return {
    station: { ...station, progressMs: newProgress },
    completed: undefined,
  };
};

/**
 * Advance all kitchen stations by `delta` milliseconds.
 * - Cutting board only advances when `isPlayerActive === true`.
 * - Stove and oven always advance.
 * - Completed stations move their order to `orderUp`; station resets to idle.
 */
export const tickKitchenStations = (
  kitchen: KitchenServiceState,
  delta: number
): KitchenServiceState => {
  const cbResult = tickCuttingBoard(kitchen.cuttingBoard, delta);
  const stoveResult = tickPassive(kitchen.stove, delta);
  const ovenResult = tickPassive(kitchen.oven, delta);

  const newOrders: KitchenOrder[] = [
    ...kitchen.orderUp,
    ...[cbResult.completed, stoveResult.completed, ovenResult.completed].filter(
      (o): o is KitchenOrder => o !== undefined
    ),
  ];

  return {
    ...kitchen,
    cuttingBoard: cbResult.station,
    stove: stoveResult.station,
    oven: ovenResult.station,
    orderUp: newOrders,
  };
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** True when all stations are idle, no pending orders, and orderUp is empty. */
export const isKitchenIdle = (kitchen: KitchenServiceState): boolean =>
  kitchen.pendingOrders.length === 0 &&
  kitchen.cuttingBoard.tag === "idle" &&
  kitchen.stove.tag === "idle" &&
  kitchen.oven.tag === "idle" &&
  kitchen.orderUp.length === 0;
