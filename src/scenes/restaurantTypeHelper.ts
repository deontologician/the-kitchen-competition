import Phaser from "phaser";
import {
  type SaveStore,
  type RestaurantType,
  findSlot,
} from "../domain/save-slots";

export const getActiveRestaurantType = (
  registry: Phaser.Data.DataManager
): RestaurantType => {
  const store: SaveStore | undefined = registry.get("saveStore");
  const activeSlotId: string | undefined = registry.get("activeSlotId");
  if (store === undefined || activeSlotId === undefined) return "burger";
  const slot = findSlot(store, activeSlotId);
  return slot?.restaurantType ?? "burger";
};

export const backgroundKey = (
  type: RestaurantType,
  scene: "grocery" | "kitchen" | "restaurant"
): string => `${type}-${scene}-bg`;

export const backgroundAssetPath = (
  type: RestaurantType,
  scene: "grocery" | "kitchen" | "restaurant"
): string => `assets/${type}-${scene}-bg.png`;

export const tableKey = (type: RestaurantType): string => `${type}-table`;

export const tableAssetPath = (type: RestaurantType): string =>
  `assets/${type}-table.png`;
