import Phaser from "phaser";
import type { DayCycle } from "../domain/day-cycle";
import { hintY, hintRegion } from "../domain/view/scene-layout";

const HINT_BG_ALPHA = 0.92;
const HINT_DEPTH = 10;

const PHASE_HINTS: Readonly<Record<string, string>> = {
  grocery: "Click ingredients to buy them. Stock up for cooking!",
  kitchen_prep: "Click green recipes to prep ingredients. Assemble dishes when ready!",
  service: "Customers order dishes. Serve Now if in stock, or Cook to make it!",
};

/**
 * Shows a small tutorial hint banner at the bottom of the screen.
 * Only shows on Day 1. Returns created objects (caller can track for cleanup).
 */
export const showTutorialHint = (
  scene: Phaser.Scene,
  phaseTag: string
): Phaser.GameObjects.GameObject[] => {
  const cycle: DayCycle | undefined = scene.registry.get("dayCycle");
  if (cycle === undefined || cycle.day !== 1) return [];

  const hint = PHASE_HINTS[phaseTag];
  if (hint === undefined) return [];

  const objects: Phaser.GameObjects.GameObject[] = [];

  // Background bar
  const bg = scene.add.graphics();
  bg.fillStyle(0x0a0a1e, HINT_BG_ALPHA);
  bg.fillRoundedRect(hintRegion.x, hintRegion.y, hintRegion.width, hintRegion.height, 6);
  bg.lineStyle(1, 0x4488cc, 0.6);
  bg.strokeRoundedRect(hintRegion.x, hintRegion.y, hintRegion.width, hintRegion.height, 6);
  bg.setDepth(HINT_DEPTH);
  objects.push(bg);

  // Hint text
  const textX = hintRegion.x + hintRegion.width / 2;
  const text = scene.add
    .text(textX, hintY, `TIP: ${hint}`, {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#88ccff",
    })
    .setOrigin(0.5)
    .setDepth(HINT_DEPTH + 1);
  objects.push(text);

  // Dismiss after 10 seconds with fade
  scene.tweens.add({
    targets: [bg, text],
    alpha: 0,
    duration: 1000,
    delay: 10_000,
    onComplete: () => {
      objects.forEach((obj) => obj.destroy());
    },
  });

  return objects;
};
