import Phaser from "phaser";
import type { ServicePhase } from "../domain/day-cycle";
import { activeCustomerId } from "../domain/day-cycle";

const BUBBLE_OFFSET_Y = -60;
const PATIENCE_BAR_W = 50;
const PATIENCE_BAR_H = 5;

const patienceColor = (fraction: number): number =>
  fraction > 0.5 ? 0x66ff66 : fraction > 0.25 ? 0xffff66 : 0xff6666;

export interface TablePositions {
  readonly positions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly sprites: ReadonlyArray<Phaser.GameObjects.Image>;
}

/**
 * Updates table sprite tints and renders order bubbles + patience bars.
 * Returns the new bubble objects (caller should track and destroy on next call).
 */
export const renderTableOverlays = (
  scene: Phaser.Scene,
  phase: ServicePhase,
  layout: TablePositions,
  oldBubbles: Phaser.GameObjects.GameObject[]
): Phaser.GameObjects.GameObject[] => {
  oldBubbles.forEach((obj) => obj.destroy());
  const bubbles: Phaser.GameObjects.GameObject[] = [];

  // Build customer info lookup
  const customerMap = new Map<
    string,
    { patienceMs: number; maxPatienceMs: number; dishId: string }
  >();
  phase.customerQueue.forEach((c) => {
    customerMap.set(c.id, {
      patienceMs: c.patienceMs,
      maxPatienceMs: c.maxPatienceMs,
      dishId: c.dishId,
    });
  });

  const activeId = activeCustomerId(phase);
  let activeDishId: string | undefined;
  if (phase.subPhase.tag === "taking_order") {
    activeDishId = phase.subPhase.customer.dishId;
  } else if (
    phase.subPhase.tag === "cooking" ||
    phase.subPhase.tag === "serving"
  ) {
    activeDishId = phase.subPhase.order.dishId;
  }

  phase.tableLayout.tables.forEach((table, i) => {
    if (i >= layout.sprites.length) return;
    const sprite = layout.sprites[i];
    const pos = layout.positions[i];
    if (table.customerId === undefined) {
      sprite.setTint(0xffffff);
      return;
    }

    const isActive = table.customerId === activeId;
    const customer = customerMap.get(table.customerId);

    const dishId = isActive ? activeDishId : customer?.dishId;
    const patienceFrac =
      customer !== undefined && customer.maxPatienceMs > 0
        ? customer.patienceMs / customer.maxPatienceMs
        : 1;

    // Tint table
    if (isActive) {
      sprite.setTint(0x6699ff);
    } else {
      sprite.setTint(patienceColor(patienceFrac));
    }

    // Order bubble (dish sprite) above table
    if (dishId !== undefined) {
      const bubbleY = pos.y + BUBBLE_OFFSET_Y;
      const spriteKey = `item-${dishId}`;
      if (scene.textures.exists(spriteKey)) {
        const dishSprite = scene.add
          .image(pos.x, bubbleY, spriteKey)
          .setDisplaySize(32, 32)
          .setAlpha(isActive ? 1 : 0.85);
        bubbles.push(dishSprite);
      }

      // Patience bar (skip for active customer)
      if (!isActive && customer !== undefined) {
        const barY = bubbleY + 20;
        const barX = pos.x - PATIENCE_BAR_W / 2;
        const gfx = scene.add.graphics();
        gfx.fillStyle(0x333333, 0.8);
        gfx.fillRect(barX, barY, PATIENCE_BAR_W, PATIENCE_BAR_H);
        gfx.fillStyle(patienceColor(patienceFrac), 1);
        gfx.fillRect(barX, barY, PATIENCE_BAR_W * patienceFrac, PATIENCE_BAR_H);
        bubbles.push(gfx);
      }
    }
  });

  return bubbles;
};
