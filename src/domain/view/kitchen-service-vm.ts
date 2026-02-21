import type { OrderId, ItemId } from "../branded";
import type { KitchenServiceState, KitchenOrder } from "../kitchen-service";
import type { KitchenZone } from "../kitchen-zones";
import { findItem } from "../items";
import { findRecipe } from "../recipes";
import type { Inventory } from "../inventory";
import { countItem } from "../inventory";

// ---------------------------------------------------------------------------
// Zone slot VM
// ---------------------------------------------------------------------------

export interface ZoneSlotVM {
  readonly slotIndex: number;
  readonly tag: "empty" | "working" | "needs_flip" | "done";
  readonly outputItemId: ItemId | undefined;
  readonly outputName: string | undefined;
  readonly spriteKey: string | undefined;
  readonly progressFraction: number;
  readonly isActive: boolean;
  readonly needsFlip: boolean;
}

export interface KitchenZoneVM {
  readonly zone: KitchenZone;
  readonly label: string;
  readonly slots: ReadonlyArray<ZoneSlotVM>;
}

// ---------------------------------------------------------------------------
// Order VMs
// ---------------------------------------------------------------------------

export interface ComponentStatus {
  readonly itemId: ItemId;
  readonly name: string;
  readonly status: "needed" | "in_zone" | "ready";
}

export interface PendingOrderVM {
  readonly orderId: OrderId;
  readonly dishName: string;
  readonly dishSpriteKey: string;
  readonly components: ReadonlyArray<ComponentStatus>;
  readonly isAssemblable: boolean;
}

// ---------------------------------------------------------------------------
// Kitchen service VM
// ---------------------------------------------------------------------------

export interface KitchenServiceVM {
  readonly pendingOrders: ReadonlyArray<PendingOrderVM>;
  readonly zones: ReadonlyArray<KitchenZoneVM>;
  readonly ready: ReadonlyArray<{ readonly itemId: ItemId; readonly name: string; readonly spriteKey: string }>;
  readonly orderUp: ReadonlyArray<{ readonly orderId: OrderId; readonly dishName: string; readonly spriteKey: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ZONE_LABELS: Record<KitchenZone, string> = {
  cuttingBoard: "Cutting Board",
  stove: "Stove",
  oven: "Oven",
};

const slotVM = (
  slot: import("../kitchen-zones").ZoneSlot,
  index: number
): ZoneSlotVM => {
  switch (slot.tag) {
    case "empty":
      return {
        slotIndex: index,
        tag: "empty",
        outputItemId: undefined,
        outputName: undefined,
        spriteKey: undefined,
        progressFraction: 0,
        isActive: false,
        needsFlip: false,
      };
    case "working": {
      const item = findItem(slot.outputItemId);
      return {
        slotIndex: index,
        tag: "working",
        outputItemId: slot.outputItemId,
        outputName: item?.name ?? slot.outputItemId,
        spriteKey: `item-${slot.outputItemId}`,
        progressFraction: slot.durationMs > 0 ? Math.min(1, slot.progressMs / slot.durationMs) : 0,
        isActive: slot.isActive,
        needsFlip: false,
      };
    }
    case "needs_flip": {
      const item = findItem(slot.outputItemId);
      return {
        slotIndex: index,
        tag: "needs_flip",
        outputItemId: slot.outputItemId,
        outputName: item?.name ?? slot.outputItemId,
        spriteKey: `item-${slot.outputItemId}`,
        progressFraction: slot.durationMs > 0 ? Math.min(1, slot.progressMs / slot.durationMs) : 0,
        isActive: false,
        needsFlip: true,
      };
    }
    case "done": {
      const item = findItem(slot.outputItemId);
      return {
        slotIndex: index,
        tag: "done",
        outputItemId: slot.outputItemId,
        outputName: item?.name ?? slot.outputItemId,
        spriteKey: `item-${slot.outputItemId}`,
        progressFraction: 1,
        isActive: false,
        needsFlip: false,
      };
    }
    default: {
      const _exhaustive: never = slot;
      return _exhaustive;
    }
  }
};

const zoneVM = (
  zone: KitchenZone,
  slots: ReadonlyArray<import("../kitchen-zones").ZoneSlot>
): KitchenZoneVM => ({
  zone,
  label: ZONE_LABELS[zone],
  slots: slots.map((s, i) => slotVM(s, i)),
});

/** Count occurrences of itemId in ready pile. */
const countInReady = (ready: ReadonlyArray<ItemId>, id: ItemId): number =>
  ready.filter((i) => i === id).length;

const pendingOrderVM = (
  order: KitchenOrder,
  kitchen: KitchenServiceState,
  inventory: Inventory
): PendingOrderVM => {
  const dish = findItem(order.dishId);
  const recipe = findRecipe(order.dishId);
  const dishName = dish?.name ?? order.dishId;

  if (recipe === undefined) {
    return {
      orderId: order.id,
      dishName,
      dishSpriteKey: `item-${order.dishId}`,
      components: [],
      isAssemblable: false,
    };
  }

  // Track consumed counts to handle multiple of same item
  const inventoryConsumed = new Map<ItemId, number>();
  const readyConsumed = new Map<ItemId, number>();

  const components: ComponentStatus[] = recipe.inputs.map((inp) => {
    const item = findItem(inp.itemId);
    const name = item?.name ?? inp.itemId;

    if (item?.category === "raw") {
      // Check inventory (accounting for already-claimed items in this loop)
      const alreadyClaimed = inventoryConsumed.get(inp.itemId) ?? 0;
      const available = countItem(inventory, inp.itemId) - alreadyClaimed;
      const have = available >= inp.quantity;
      if (have) {
        inventoryConsumed.set(inp.itemId, alreadyClaimed + inp.quantity);
      }
      return { itemId: inp.itemId, name, status: have ? "ready" : "needed" };
    } else {
      // Check zones: first look in ready pile, then in active zone slots
      const alreadyClaimed = readyConsumed.get(inp.itemId) ?? 0;
      const inReady = countInReady(kitchen.zones.ready, inp.itemId) - alreadyClaimed;
      if (inReady >= inp.quantity) {
        readyConsumed.set(inp.itemId, alreadyClaimed + inp.quantity);
        return { itemId: inp.itemId, name, status: "ready" };
      }

      // Check if in a zone slot
      const allSlots = [...kitchen.zones.cuttingBoard, ...kitchen.zones.stove, ...kitchen.zones.oven];
      const inZone = allSlots.some(
        (s) => (s.tag === "working" || s.tag === "needs_flip") && s.outputItemId === inp.itemId
      );
      return { itemId: inp.itemId, name, status: inZone ? "in_zone" : "needed" };
    }
  });

  const isAssemblable = components.every((c) => c.status === "ready");

  return {
    orderId: order.id,
    dishName,
    dishSpriteKey: `item-${order.dishId}`,
    components,
    isAssemblable,
  };
};

// ---------------------------------------------------------------------------
// Main VM function
// ---------------------------------------------------------------------------

export const kitchenServiceVM = (
  kitchen: KitchenServiceState,
  inventory: Inventory
): KitchenServiceVM => {
  const zones: KitchenZoneVM[] = [
    zoneVM("cuttingBoard", kitchen.zones.cuttingBoard),
    zoneVM("stove", kitchen.zones.stove),
    zoneVM("oven", kitchen.zones.oven),
  ];

  const ready = kitchen.zones.ready.map((id) => {
    const item = findItem(id);
    return {
      itemId: id,
      name: item?.name ?? id,
      spriteKey: `item-${id}`,
    };
  });

  const orderUp = kitchen.orderUp.map((o) => {
    const item = findItem(o.dishId);
    return {
      orderId: o.id,
      dishName: item?.name ?? o.dishId,
      spriteKey: `item-${o.dishId}`,
    };
  });

  return {
    pendingOrders: kitchen.pendingOrders.map((o) => pendingOrderVM(o, kitchen, inventory)),
    zones,
    ready,
    orderUp,
  };
};
