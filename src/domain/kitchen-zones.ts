// ---------------------------------------------------------------------------
// Kitchen zone types (pure domain, zero Phaser)
// ---------------------------------------------------------------------------

export type KitchenZone = "cuttingBoard" | "stove" | "oven";
export type ZoneInteraction = "hold" | "flip" | "auto";

export const ZONE_CAPACITIES: Record<KitchenZone, number> = {
  cuttingBoard: 1,
  stove: 3,
  oven: 2,
};

// ---------------------------------------------------------------------------
// Slot state (discriminated union)
// ---------------------------------------------------------------------------

import type { ItemId } from "./branded";

export type ZoneSlot =
  | { readonly tag: "empty" }
  | {
      readonly tag: "working";
      readonly outputItemId: ItemId;
      readonly interaction: ZoneInteraction;
      readonly progressMs: number;
      readonly durationMs: number;
      readonly isActive: boolean;
    }
  | {
      readonly tag: "needs_flip";
      readonly outputItemId: ItemId;
      readonly progressMs: number;
      readonly durationMs: number;
    }
  | { readonly tag: "done"; readonly outputItemId: ItemId };

export interface KitchenZoneState {
  readonly cuttingBoard: ReadonlyArray<ZoneSlot>;
  readonly stove: ReadonlyArray<ZoneSlot>;
  readonly oven: ReadonlyArray<ZoneSlot>;
  readonly ready: ReadonlyArray<ItemId>;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const createKitchenZoneState = (): KitchenZoneState => ({
  cuttingBoard: [{ tag: "empty" }],
  stove: [{ tag: "empty" }, { tag: "empty" }, { tag: "empty" }],
  oven: [{ tag: "empty" }, { tag: "empty" }],
  ready: [],
});

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Place an item in the first empty slot of a zone. Returns undefined if zone full. */
export const placeItemInZone = (
  state: KitchenZoneState,
  zone: KitchenZone,
  outputItemId: ItemId,
  durationMs: number,
  interaction: ZoneInteraction
): KitchenZoneState | undefined => {
  const slots = state[zone];
  const emptyIdx = slots.findIndex((s) => s.tag === "empty");
  if (emptyIdx < 0) return undefined;

  const newSlot: ZoneSlot = {
    tag: "working",
    outputItemId,
    interaction,
    progressMs: 0,
    durationMs,
    // hold starts inactive; auto/flip start active
    isActive: interaction !== "hold",
  };

  return {
    ...state,
    [zone]: slots.map((s, i) => (i === emptyIdx ? newSlot : s)),
  };
};

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/** Activate or deactivate a cutting board slot (hold mechanic). */
export const activateCuttingBoardSlot = (
  state: KitchenZoneState,
  slotIdx: number,
  active: boolean
): KitchenZoneState => {
  const slots = state.cuttingBoard;
  const slot = slots[slotIdx];
  if (slot === undefined || slot.tag !== "working") return state;
  return {
    ...state,
    cuttingBoard: slots.map((s, i) =>
      i === slotIdx && s.tag === "working" ? { ...s, isActive: active } : s
    ),
  };
};

/** Flip a stove slot that is in needs_flip state → resume cooking. */
export const flipStoveSlot = (
  state: KitchenZoneState,
  slotIdx: number
): KitchenZoneState => {
  const slots = state.stove;
  const slot = slots[slotIdx];
  if (slot === undefined || slot.tag !== "needs_flip") return state;
  const resumed: ZoneSlot = {
    tag: "working",
    outputItemId: slot.outputItemId,
    interaction: "flip",
    progressMs: slot.progressMs,
    durationMs: slot.durationMs,
    isActive: true,
  };
  return {
    ...state,
    stove: slots.map((s, i) => (i === slotIdx ? resumed : s)),
  };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/** Remove the first occurrence of itemId from ready pile. */
export const retrieveReadyItem = (
  state: KitchenZoneState,
  itemId: ItemId
): { zones: KitchenZoneState; itemId: ItemId } | undefined => {
  const idx = state.ready.indexOf(itemId);
  if (idx < 0) return undefined;
  return {
    zones: {
      ...state,
      ready: state.ready.filter((_, i) => i !== idx),
    },
    itemId,
  };
};

// ---------------------------------------------------------------------------
// Ticking
// ---------------------------------------------------------------------------

const tickSlot = (
  slot: ZoneSlot,
  delta: number
): { slot: ZoneSlot; completed: ItemId | undefined } => {
  if (slot.tag !== "working" && slot.tag !== "needs_flip") {
    return { slot, completed: undefined };
  }
  if (slot.tag === "needs_flip") {
    // Paused until flipped
    return { slot, completed: undefined };
  }
  // working
  if (!slot.isActive) {
    // hold interaction waiting for player
    return { slot, completed: undefined };
  }

  const newProgress = slot.progressMs + delta;

  // Flip interaction: pause at 50%
  if (slot.interaction === "flip" && slot.progressMs < slot.durationMs / 2 && newProgress >= slot.durationMs / 2) {
    const paused: ZoneSlot = {
      tag: "needs_flip",
      outputItemId: slot.outputItemId,
      progressMs: slot.durationMs / 2,
      durationMs: slot.durationMs,
    };
    return { slot: paused, completed: undefined };
  }

  if (newProgress >= slot.durationMs) {
    return { slot: { tag: "empty" }, completed: slot.outputItemId };
  }

  return {
    slot: { ...slot, progressMs: newProgress },
    completed: undefined,
  };
};

const tickZoneSlots = (
  slots: ReadonlyArray<ZoneSlot>,
  delta: number
): { slots: ReadonlyArray<ZoneSlot>; completed: ReadonlyArray<ItemId> } => {
  const results = slots.map((s) => tickSlot(s, delta));
  return {
    slots: results.map((r) => r.slot),
    completed: results.map((r) => r.completed).filter((c): c is ItemId => c !== undefined),
  };
};

export const tickKitchenZones = (
  state: KitchenZoneState,
  delta: number
): KitchenZoneState => {
  const cbResult = tickZoneSlots(state.cuttingBoard, delta);
  const stoveResult = tickZoneSlots(state.stove, delta);
  const ovenResult = tickZoneSlots(state.oven, delta);

  return {
    cuttingBoard: cbResult.slots,
    stove: stoveResult.slots,
    oven: ovenResult.slots,
    ready: [
      ...state.ready,
      ...cbResult.completed,
      ...stoveResult.completed,
      ...ovenResult.completed,
    ],
  };
};
