import Phaser from "phaser";
import type { SlotId } from "../domain/branded";
import {
  type SaveStore,
  findSlot,
  updateSlot,
  createSaveSlot,
} from "../domain/save-slots";

export const recordSceneEntry = (
  registry: Phaser.Data.DataManager,
  sceneKey: string
): void => {
  const store: SaveStore | undefined = registry.get("saveStore");
  const activeSlotId: SlotId | undefined = registry.get("activeSlotId");
  if (store === undefined || activeSlotId === undefined) return;

  const slot = findSlot(store, activeSlotId);
  if (slot === undefined) return;

  const updated = createSaveSlot(
    slot.id,
    slot.restaurantType,
    slot.day,
    slot.coins,
    sceneKey,
    Date.now()
  );
  registry.set("saveStore", updateSlot(store, updated));
};

export const recordDayAdvance = (
  registry: Phaser.Data.DataManager,
  day: number
): void => {
  const store: SaveStore | undefined = registry.get("saveStore");
  const activeSlotId: SlotId | undefined = registry.get("activeSlotId");
  if (store === undefined || activeSlotId === undefined) return;

  const slot = findSlot(store, activeSlotId);
  if (slot === undefined) return;

  const updated = createSaveSlot(
    slot.id,
    slot.restaurantType,
    day,
    slot.coins,
    slot.scene,
    Date.now()
  );
  registry.set("saveStore", updateSlot(store, updated));
};
