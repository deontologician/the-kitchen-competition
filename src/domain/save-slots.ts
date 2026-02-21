import type { SlotId, ItemId } from "./branded";
import { slotId } from "./branded";
import { deserializeSave } from "./save-game";
import type { RestaurantType } from "./restaurant-type";
import { restaurantDisplayName } from "./restaurant-type";

export type { RestaurantType } from "./restaurant-type";
export { restaurantDisplayName } from "./restaurant-type";

export interface SaveSlot {
  readonly id: SlotId;
  readonly restaurantType: RestaurantType;
  readonly day: number;
  readonly coins: number;
  readonly scene: string;
  readonly lastSaved: number;
  readonly unlockedDishes: number;
  readonly disabledDishes?: ReadonlyArray<ItemId>;
}

export interface SaveStore {
  readonly version: 2;
  readonly slots: ReadonlyArray<SaveSlot>;
}

const VALID_RESTAURANT_TYPES: ReadonlyArray<string> = ["sushi", "bbq", "burger"];

const SCENE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  GroceryScene: "Grocery Store",
  KitchenScene: "Kitchen",
  RestaurantScene: "Restaurant",
  TitleScene: "Title",
};

export const createSaveSlot = (
  id: SlotId,
  restaurantType: RestaurantType,
  day: number,
  coins: number,
  scene: string,
  lastSaved: number,
  unlockedDishes: number = 5,
  disabledDishes?: ReadonlyArray<ItemId>
): SaveSlot => {
  const base: SaveSlot = { id, restaurantType, day, coins, scene, lastSaved, unlockedDishes };
  return disabledDishes !== undefined && disabledDishes.length > 0
    ? { ...base, disabledDishes }
    : base;
};

export const toggleDish = (
  slot: SaveSlot,
  dishId: ItemId,
  allEnabled: ReadonlyArray<ItemId>
): SaveSlot => {
  const disabled = slot.disabledDishes ?? [];
  const isCurrentlyDisabled = disabled.includes(dishId);
  if (isCurrentlyDisabled) {
    // Re-enable: remove from disabled list
    return { ...slot, disabledDishes: disabled.filter((id) => id !== dishId) };
  }
  // Disable: only if at least 2 are currently enabled
  if (allEnabled.length < 2) return slot;
  return { ...slot, disabledDishes: [...disabled, dishId] };
};

export const createSaveStore = (): SaveStore => ({
  version: 2,
  slots: [],
});

export const addSlot = (store: SaveStore, slot: SaveSlot): SaveStore => ({
  ...store,
  slots: [...store.slots, slot],
});

export const updateSlot = (store: SaveStore, slot: SaveSlot): SaveStore => ({
  ...store,
  slots: store.slots.map((s) => (s.id === slot.id ? slot : s)),
});

export const removeSlot = (store: SaveStore, id: SlotId): SaveStore => ({
  ...store,
  slots: store.slots.filter((s) => s.id !== id),
});

export const findSlot = (
  store: SaveStore,
  id: SlotId
): SaveSlot | undefined => store.slots.find((s) => s.id === id);

export const findMostRecent = (
  store: SaveStore
): SaveSlot | undefined =>
  store.slots.length === 0
    ? undefined
    : store.slots.reduce((best, s) =>
        s.lastSaved > best.lastSaved ? s : best
      );

export const serializeStore = (store: SaveStore): string =>
  JSON.stringify(store);

const isValidSlot = (s: unknown): s is SaveSlot => {
  if (typeof s !== "object" || s === null) return false;
  const rec = s as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.restaurantType === "string" &&
    VALID_RESTAURANT_TYPES.includes(rec.restaurantType) &&
    typeof rec.day === "number" &&
    Number.isInteger(rec.day) &&
    rec.day >= 1 &&
    typeof rec.coins === "number" &&
    Number.isInteger(rec.coins) &&
    rec.coins >= 0 &&
    typeof rec.scene === "string" &&
    typeof rec.lastSaved === "number"
  );
};

export const deserializeStore = (json: string): SaveStore | undefined => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const rec = parsed as Record<string, unknown>;
    if (rec.version !== 2) return undefined;
    if (!Array.isArray(rec.slots)) return undefined;
    if (!rec.slots.every(isValidSlot)) return undefined;
    return {
      version: 2,
      slots: rec.slots.map((s) => {
        const raw = s as unknown as Record<string, unknown>;
        const unlocked =
          typeof raw.unlockedDishes === "number" &&
          Number.isInteger(raw.unlockedDishes) &&
          raw.unlockedDishes >= 1
            ? raw.unlockedDishes
            : 5;
        const disabled: ReadonlyArray<ItemId> | undefined =
          Array.isArray(raw.disabledDishes) &&
          raw.disabledDishes.every((d: unknown) => typeof d === "string") &&
          raw.disabledDishes.length > 0
            ? (raw.disabledDishes as ItemId[])
            : undefined;
        return createSaveSlot(
          slotId(s.id),
          s.restaurantType,
          s.day,
          s.coins,
          s.scene,
          s.lastSaved,
          unlocked,
          disabled
        );
      }),
    };
  } catch {
    return undefined;
  }
};

export const loadStore = (
  raw: string | null,
  migrationId: SlotId,
  migrationTimestamp: number
): SaveStore => {
  if (raw === null) return createSaveStore();

  const v2 = deserializeStore(raw);
  if (v2 !== undefined) return v2;

  const v1 = deserializeSave(raw);
  if (v1 !== undefined) {
    return addSlot(
      createSaveStore(),
      createSaveSlot(
        migrationId,
        "burger",
        1,
        v1.coins,
        "GroceryScene",
        migrationTimestamp
      )
    );
  }

  return createSaveStore();
};

export const sceneDisplayName = (sceneKey: string): string =>
  SCENE_DISPLAY_NAMES[sceneKey] ?? sceneKey;

export const formatSlotSummary = (slot: SaveSlot): string =>
  `Day ${slot.day} - ${restaurantDisplayName(slot.restaurantType)} - $${slot.coins}`;
