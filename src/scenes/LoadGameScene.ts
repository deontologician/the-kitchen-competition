import Phaser from "phaser";
import { addMenuButton } from "./renderPixelText";
import { createWallet } from "../domain/wallet";
import {
  type SaveStore,
  createSaveStore,
  formatSlotSummary,
} from "../domain/save-slots";
import { createDayCycle } from "../domain/day-cycle";

export class LoadGameScene extends Phaser.Scene {
  constructor() {
    super("LoadGameScene");
  }

  create(): void {
    this.add
      .image(this.scale.width / 2, this.scale.height / 2, "title-bg")
      .setDisplaySize(this.scale.width, this.scale.height);

    const store: SaveStore =
      this.registry.get("saveStore") ?? createSaveStore();

    const sorted = [...store.slots].sort(
      (a, b) => b.lastSaved - a.lastSaved
    );

    const centerX = this.scale.width / 2;
    let buttonY = 160;
    const spacing = 50;

    this.add
      .text(centerX, 100, "Load Game", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#f5a623",
      })
      .setOrigin(0.5);

    sorted.forEach((slot) => {
      addMenuButton(
        this,
        centerX,
        buttonY,
        formatSlotSummary(slot),
        () => {
          this.registry.set("activeSlotId", slot.id);
          this.registry.set("wallet", createWallet(slot.coins));
          this.registry.set("dayCycle", createDayCycle(slot.day));
          this.scene.start("GroceryScene");
        }
      );
      buttonY += spacing;
    });

    addMenuButton(this, centerX, buttonY + 20, "Back", () => {
      this.scene.start("TitleScene");
    });
  }
}
