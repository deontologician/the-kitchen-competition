import Phaser from "phaser";
import { addMenuButton } from "./renderPixelText";
import { createWallet } from "../domain/wallet";
import {
  type SaveStore,
  type SaveSlot,
  createSaveStore,
  formatSlotSummary,
} from "../domain/save-slots";
import { type DayCycle, createDayCycle, activeSceneForPhase } from "../domain/day-cycle";
import { createInventory } from "../domain/inventory";
import { canvas, menuStack } from "../domain/view/scene-layout";

export class LoadGameScene extends Phaser.Scene {
  constructor() {
    super("LoadGameScene");
  }

  create(): void {
    this.add
      .image(canvas.width / 2, canvas.height / 2, "title-bg")
      .setDisplaySize(canvas.width, canvas.height);

    const store: SaveStore =
      this.registry.get("saveStore") ?? createSaveStore();

    const sorted = [...store.slots].sort(
      (a, b) => b.lastSaved - a.lastSaved
    );

    const centerX = canvas.width / 2;
    const positions = menuStack(140, sorted.length + 1);

    this.add
      .text(centerX, 100, "Load Game", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#f5a623",
      })
      .setOrigin(0.5);

    sorted.forEach((slot, i) => {
      addMenuButton(
        this,
        positions[i].x,
        positions[i].y,
        formatSlotSummary(slot),
        () => this.loadSlot(slot)
      );
    });

    addMenuButton(this, positions[sorted.length].x, positions[sorted.length].y, "Back", () => {
      this.scene.start("TitleScene");
    });
  }

  private loadSlot(slot: SaveSlot): void {
    this.registry.set("activeSlotId", slot.id);
    this.registry.set("wallet", createWallet(slot.coins));
    const dayCycle: DayCycle = slot.phase !== undefined
      ? { day: slot.day, phase: slot.phase }
      : createDayCycle(slot.day);
    this.registry.set("dayCycle", dayCycle);
    this.registry.set("inventory", slot.inventory ?? createInventory());
    this.scene.start(activeSceneForPhase(dayCycle.phase));
  }
}
