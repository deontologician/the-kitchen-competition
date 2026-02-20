import Phaser from "phaser";
import { findItem } from "../domain/items";
import {
  itemCounts,
  itemFreshness,
  type Inventory,
} from "../domain/inventory";

const freshnessColor = (frac: number): string =>
  frac > 0.5 ? "#ffffff" : frac > 0.25 ? "#ffcc00" : "#ff6644";

export const renderInventorySidebar = (
  scene: Phaser.Scene,
  inv: Inventory,
  objects: Phaser.GameObjects.GameObject[]
): Phaser.GameObjects.GameObject[] => {
  objects.forEach((obj) => obj.destroy());
  const result: Phaser.GameObjects.GameObject[] = [];

  const counts = itemCounts(inv);
  if (counts.length === 0) return result;

  const freshMap = new Map<string, number>();
  itemFreshness(inv, Date.now()).forEach((f) =>
    freshMap.set(f.itemId, f.freshness)
  );

  const x = scene.scale.width - 30;
  let y = 90;

  const dishCounts = counts.filter((c) => {
    const item = findItem(c.itemId);
    return item !== undefined && item.category === "dish";
  });
  const preppedCounts = counts.filter((c) => {
    const item = findItem(c.itemId);
    return item !== undefined && item.category === "prepped";
  });

  const renderEntry = (itemId: string, count: number): void => {
    const item = findItem(itemId);
    const name = item?.name ?? itemId;
    const display = name.length > 12 ? name.slice(0, 11) + "." : name;
    const freshness = freshMap.get(itemId) ?? 1;
    const color = freshnessColor(freshness);
    const label = scene.add
      .text(x, y, `${display} x${count}`, {
        fontFamily: "monospace",
        fontSize: "10px",
        color,
        backgroundColor: "#000000",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(1, 0)
      .setAlpha(0.8);
    result.push(label);
    y += 14;
  };

  dishCounts.forEach((c) => renderEntry(c.itemId, c.count));

  if (dishCounts.length > 0 && preppedCounts.length > 0) {
    const divider = scene.add
      .text(x, y, "───────", {
        fontFamily: "monospace",
        fontSize: "8px",
        color: "#666677",
      })
      .setOrigin(1, 0)
      .setAlpha(0.6);
    result.push(divider);
    y += 10;
  }

  preppedCounts.forEach((c) => renderEntry(c.itemId, c.count));

  return result;
};
