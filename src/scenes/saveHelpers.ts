import Phaser from "phaser";
import type { SlotId } from "../domain/branded";
import {
  type SaveStore,
  findSlot,
  updateSlot,
  patchSlot,
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

  const updated = patchSlot(slot, { scene: sceneKey, lastSaved: Date.now() });
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

  const updated = patchSlot(slot, { day, lastSaved: Date.now() });
  registry.set("saveStore", updateSlot(store, updated));
};
