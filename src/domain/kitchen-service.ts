import type { OrderId, ItemId } from "./branded";
import { findItem } from "./items";
import { findRecipe } from "./recipes";
import { removeItems, removeItemSet, type Inventory } from "./inventory";
import {
  createKitchenZoneState,
  placeItemInZone,
  activateCuttingBoardSlot,
  flipStoveSlot,
  tickKitchenZones,
  type KitchenZoneState,
  type KitchenZone,
  type ZoneInteraction,
} from "./kitchen-zones";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KitchenOrder {
  readonly id: OrderId;
  readonly customerId: string;
  readonly dishId: ItemId;
}

export interface KitchenServiceState {
  readonly pendingOrders: ReadonlyArray<KitchenOrder>;
  readonly zones: KitchenZoneState;
  readonly orderUp: ReadonlyArray<KitchenOrder>;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const createKitchenServiceState = (): KitchenServiceState => ({
  pendingOrders: [],
  zones: createKitchenZoneState(),
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
// Zone interactions
// ---------------------------------------------------------------------------

/**
 * Consume inputItemId from inventory, place outputItemId in zone.
 * Returns undefined if input not in inventory or zone is full.
 */
export const placeIngredientInZone = (
  kitchen: KitchenServiceState,
  inventory: Inventory,
  inputItemId: ItemId,
  outputItemId: ItemId,
  zone: KitchenZone,
  durationMs: number,
  interaction: ZoneInteraction
): { kitchen: KitchenServiceState; inventory: Inventory } | undefined => {
  const newInventory = removeItems(inventory, inputItemId, 1);
  if (newInventory === undefined) return undefined;

  const newZones = placeItemInZone(kitchen.zones, zone, outputItemId, durationMs, interaction);
  if (newZones === undefined) return undefined;

  return {
    kitchen: { ...kitchen, zones: newZones },
    inventory: newInventory,
  };
};

/** Activate/deactivate a cutting board slot (hold mechanic). */
export const activateCuttingBoard = (
  kitchen: KitchenServiceState,
  slotIdx: number,
  active: boolean
): KitchenServiceState => ({
  ...kitchen,
  zones: activateCuttingBoardSlot(kitchen.zones, slotIdx, active),
});

/** Flip a stove slot out of needs_flip. */
export const flipStove = (
  kitchen: KitchenServiceState,
  slotIdx: number
): KitchenServiceState => ({
  ...kitchen,
  zones: flipStoveSlot(kitchen.zones, slotIdx),
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Remove prepped items from zones.ready or raw items from inventory atomically.
 * Returns undefined if anything is missing.
 */
const removeFromReady = (
  ready: ReadonlyArray<ItemId>,
  itemId: ItemId,
  quantity: number
): ReadonlyArray<ItemId> | undefined => {
  let count = 0;
  const remaining: ItemId[] = [];
  ready.forEach((id) => {
    if (id === itemId && count < quantity) {
      count++;
    } else {
      remaining.push(id);
    }
  });
  return count === quantity ? remaining : undefined;
};

/**
 * Assemble an order from components:
 * - "raw" category inputs: consumed from inventory
 * - "prepped" category inputs: consumed from zones.ready
 * Atomic — returns undefined if anything missing.
 */
export const assembleOrder = (
  kitchen: KitchenServiceState,
  inventory: Inventory,
  oid: OrderId
): { kitchen: KitchenServiceState; inventory: Inventory } | undefined => {
  const order = kitchen.pendingOrders.find((o) => o.id === oid);
  if (order === undefined) return undefined;

  const recipe = findRecipe(order.dishId);
  if (recipe === undefined) return undefined;

  // Separate raw vs prepped inputs
  const rawInputs = recipe.inputs.filter((inp) => {
    const item = findItem(inp.itemId);
    return item?.category === "raw";
  });
  const preppedInputs = recipe.inputs.filter((inp) => {
    const item = findItem(inp.itemId);
    return item?.category === "prepped";
  });

  // Atomically consume raw from inventory
  const newInventory = removeItemSet(inventory, rawInputs);
  if (newInventory === undefined) return undefined;

  // Atomically consume prepped from zones.ready
  let newReady: ReadonlyArray<ItemId> = kitchen.zones.ready;
  for (const inp of preppedInputs) {
    const result = removeFromReady(newReady, inp.itemId, inp.quantity);
    if (result === undefined) return undefined;
    newReady = result;
  }

  return {
    kitchen: {
      ...kitchen,
      pendingOrders: kitchen.pendingOrders.filter((o) => o.id !== oid),
      zones: { ...kitchen.zones, ready: newReady },
      orderUp: [...kitchen.orderUp, order],
    },
    inventory: newInventory,
  };
};

// ---------------------------------------------------------------------------
// Ticking
// ---------------------------------------------------------------------------

/** Advance all kitchen zones by delta milliseconds. */
export const tickKitchenService = (
  kitchen: KitchenServiceState,
  delta: number
): KitchenServiceState => ({
  ...kitchen,
  zones: tickKitchenZones(kitchen.zones, delta),
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

const hasActiveZoneSlots = (zones: KitchenZoneState): boolean =>
  [...zones.cuttingBoard, ...zones.stove, ...zones.oven].some(
    (s) => s.tag === "working" || s.tag === "needs_flip"
  );

/** True when no pending orders, no active zone slots, ready pile empty, orderUp empty. */
export const isKitchenIdle = (kitchen: KitchenServiceState): boolean =>
  kitchen.pendingOrders.length === 0 &&
  !hasActiveZoneSlots(kitchen.zones) &&
  kitchen.zones.ready.length === 0 &&
  kitchen.orderUp.length === 0;
