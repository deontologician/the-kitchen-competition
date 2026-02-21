import Phaser from "phaser";
import type { ServicePhase } from "../domain/day-cycle";

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

  phase.tables.forEach((tableState, i) => {
    if (i >= layout.sprites.length) return;
    const sprite = layout.sprites[i];
    const pos = layout.positions[i];

    switch (tableState.tag) {
      case "empty":
        sprite.setTint(0xffffff);
        return;

      case "customer_waiting": {
        const { customer } = tableState;
        const patienceFrac =
          customer.maxPatienceMs > 0
            ? customer.patienceMs / customer.maxPatienceMs
            : 1;
        sprite.setTint(patienceColor(patienceFrac));

        // Order bubble
        const spriteKey = `item-${customer.dishId}`;
        if (scene.textures.exists(spriteKey)) {
          const bubbleY = pos.y + BUBBLE_OFFSET_Y;
          bubbles.push(
            scene.add
              .image(pos.x, bubbleY, spriteKey)
              .setDisplaySize(32, 32)
              .setAlpha(0.85)
          );

          // Patience bar
          const barY = bubbleY + 20;
          const barX = pos.x - PATIENCE_BAR_W / 2;
          const gfx = scene.add.graphics();
          gfx.fillStyle(0x333333, 0.8);
          gfx.fillRect(barX, barY, PATIENCE_BAR_W, PATIENCE_BAR_H);
          gfx.fillStyle(patienceColor(patienceFrac), 1);
          gfx.fillRect(barX, barY, PATIENCE_BAR_W * patienceFrac, PATIENCE_BAR_H);
          bubbles.push(gfx);
        }
        return;
      }

      case "order_pending": {
        const { customer } = tableState;
        const patienceFrac =
          customer.maxPatienceMs > 0
            ? customer.patienceMs / customer.maxPatienceMs
            : 1;
        sprite.setTint(patienceColor(patienceFrac));

        const spriteKey = `item-${customer.dishId}`;
        if (scene.textures.exists(spriteKey)) {
          const bubbleY = pos.y + BUBBLE_OFFSET_Y;
          bubbles.push(
            scene.add
              .image(pos.x, bubbleY, spriteKey)
              .setDisplaySize(32, 32)
              .setAlpha(0.85)
          );

          const barY = bubbleY + 20;
          const barX = pos.x - PATIENCE_BAR_W / 2;
          const gfx = scene.add.graphics();
          gfx.fillStyle(0x333333, 0.8);
          gfx.fillRect(barX, barY, PATIENCE_BAR_W, PATIENCE_BAR_H);
          gfx.fillStyle(patienceColor(patienceFrac), 1);
          gfx.fillRect(barX, barY, PATIENCE_BAR_W * patienceFrac, PATIENCE_BAR_H);
          bubbles.push(gfx);
        }
        return;
      }

      case "in_kitchen": {
        const { customer } = tableState;
        const patienceFrac =
          customer.maxPatienceMs > 0
            ? customer.patienceMs / customer.maxPatienceMs
            : 1;
        sprite.setTint(patienceColor(patienceFrac));

        // Show "cooking" indicator
        const spriteKey = `item-${customer.dishId}`;
        const bubbleY = pos.y + BUBBLE_OFFSET_Y;
        if (scene.textures.exists(spriteKey)) {
          bubbles.push(
            scene.add
              .image(pos.x, bubbleY, spriteKey)
              .setDisplaySize(32, 32)
              .setAlpha(0.5)
          );
        }
        // "..." indicator
        bubbles.push(
          scene.add
            .text(pos.x, bubbleY + 18, "...", {
              fontFamily: "monospace",
              fontSize: "10px",
              color: "#aaaaff",
            })
            .setOrigin(0.5)
        );

        const barY = bubbleY + 30;
        const barX = pos.x - PATIENCE_BAR_W / 2;
        const gfx = scene.add.graphics();
        gfx.fillStyle(0x333333, 0.8);
        gfx.fillRect(barX, barY, PATIENCE_BAR_W, PATIENCE_BAR_H);
        gfx.fillStyle(patienceColor(patienceFrac), 1);
        gfx.fillRect(barX, barY, PATIENCE_BAR_W * patienceFrac, PATIENCE_BAR_H);
        bubbles.push(gfx);
        return;
      }

      case "ready_to_serve": {
        // Highlighted: order is ready!
        sprite.setTint(0x6699ff);
        const { customer } = tableState;

        const spriteKey = `item-${customer.dishId}`;
        if (scene.textures.exists(spriteKey)) {
          const bubbleY = pos.y + BUBBLE_OFFSET_Y;
          bubbles.push(
            scene.add
              .image(pos.x, bubbleY, spriteKey)
              .setDisplaySize(32, 32)
              .setAlpha(1)
          );
        }
        return;
      }
    }
  });

  return bubbles;
};
