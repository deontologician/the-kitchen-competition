import Phaser from "phaser";
import type { SlotId } from "../domain/branded";
import { addMenuButton } from "./renderPixelText";
import { renderPanel } from "./panel";
import {
  type SaveStore,
  type SaveSlot,
  findSlot,
  updateSlot,
  patchSlot,
  createSaveStore,
  formatSlotSummary,
} from "../domain/save-slots";
import {
  type Wallet,
  initialWallet,
  addCoins,
  createWallet,
} from "../domain/wallet";
import {
  type DayCycle,
  advanceToKitchenPrep,
  advanceToService,
  advanceToDayEnd,
  activeSceneForPhase,
  defaultDurations,
  createDayCycle,
} from "../domain/day-cycle";
import { createInventory, type Inventory } from "../domain/inventory";
import { canvas, menuStack } from "../domain/view/scene-layout";
import { snapshotSlotPatch } from "../domain/snapshot";

export class PauseScene extends Phaser.Scene {
  private callerScene = "";
  private menuObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("PauseScene");
  }

  create(data: { callerScene: string }): void {
    this.callerScene = data.callerScene;
    this.menuObjects = [];

    // Dark overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, canvas.width, canvas.height);

    // Esc to resume
    this.input.keyboard!.on("keydown-ESC", () => this.resume());

    this.showMainMenu();
  }

  private clearMenu(): void {
    this.menuObjects.forEach((obj) => obj.destroy());
    this.menuObjects = [];
  }

  private resume(): void {
    this.scene.resume(this.callerScene);
    this.scene.stop();
  }

  private showMainMenu(): void {
    this.clearMenu();

    const centerX = canvas.width / 2;
    const positions = menuStack(240, 5);

    // Title
    this.menuObjects.push(
      this.add
        .text(centerX, 200, "PAUSED", {
          fontFamily: "monospace",
          fontSize: "24px",
          color: "#f5a623",
        })
        .setOrigin(0.5)
    );

    // Resume
    this.menuObjects.push(
      addMenuButton(this, positions[0].x, positions[0].y, "Resume", () => this.resume())
    );

    // Save
    this.menuObjects.push(
      addMenuButton(this, positions[1].x, positions[1].y, "Save", () => this.saveGame())
    );

    // Load Game
    this.menuObjects.push(
      addMenuButton(this, positions[2].x, positions[2].y, "Load Game", () => this.showLoadMenu())
    );

    // Debug
    this.menuObjects.push(
      addMenuButton(this, positions[3].x, positions[3].y, "Debug", () => this.showDebugMenu())
    );

    // Quit to Title
    this.menuObjects.push(
      addMenuButton(this, positions[4].x, positions[4].y, "Quit to Title", () => {
        this.scene.stop(this.callerScene);
        this.scene.start("TitleScene");
        this.scene.stop();
      })
    );
  }

  private saveGame(): void {
    const store: SaveStore | undefined = this.registry.get("saveStore");
    const activeSlotId: SlotId | undefined = this.registry.get("activeSlotId");
    if (store === undefined || activeSlotId === undefined) return;

    const slot = findSlot(store, activeSlotId);
    if (slot === undefined) return;

    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const dayCycle: DayCycle | undefined = this.registry.get("dayCycle");
    const inventory: Inventory = this.registry.get("inventory") ?? createInventory();
    if (dayCycle === undefined) return;

    const patch = snapshotSlotPatch(wallet, dayCycle, inventory);
    this.registry.set("saveStore", updateSlot(store, patchSlot(slot, patch)));

    // Brief "Saved!" feedback
    const centerX = canvas.width / 2;
    const feedback = this.add
      .text(centerX, 160, "Saved!", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#4caf50",
      })
      .setOrigin(0.5);

    this.time.delayedCall(1_500, () => feedback.destroy());
  }

  private showLoadMenu(): void {
    this.clearMenu();

    const store: SaveStore =
      this.registry.get("saveStore") ?? createSaveStore();

    const sorted = [...store.slots].sort(
      (a, b) => b.lastSaved - a.lastSaved
    );

    const centerX = canvas.width / 2;
    const itemCount = Math.max(sorted.length, 1) + 1; // slots (or "no slots" placeholder) + Back
    const positions = menuStack(240, itemCount);

    this.menuObjects.push(
      this.add
        .text(centerX, 200, "LOAD GAME", {
          fontFamily: "monospace",
          fontSize: "24px",
          color: "#f5a623",
        })
        .setOrigin(0.5)
    );

    let idx = 0;

    sorted.forEach((slot: SaveSlot) => {
      this.menuObjects.push(
        addMenuButton(
          this,
          positions[idx].x,
          positions[idx].y,
          formatSlotSummary(slot),
          () => this.loadSlot(slot)
        )
      );
      idx++;
    });

    if (sorted.length === 0) {
      this.menuObjects.push(
        this.add
          .text(positions[idx].x, positions[idx].y, "No save slots found", {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#888899",
          })
          .setOrigin(0.5)
      );
      idx++;
    }

    this.menuObjects.push(
      addMenuButton(this, positions[idx].x, positions[idx].y, "Back", () => this.showMainMenu())
    );
  }

  private showDebugMenu(): void {
    this.clearMenu();

    const centerX = canvas.width / 2;
    const positions = menuStack(240, 3);

    this.menuObjects.push(
      this.add
        .text(centerX, 200, "DEBUG", {
          fontFamily: "monospace",
          fontSize: "24px",
          color: "#f5a623",
        })
        .setOrigin(0.5)
    );

    // Skip Phase
    this.menuObjects.push(
      addMenuButton(this, positions[0].x, positions[0].y, "Skip Phase", () => {
        const cycle: DayCycle | undefined = this.registry.get("dayCycle");
        if (cycle === undefined) return;

        let next: DayCycle;
        switch (cycle.phase.tag) {
          case "grocery":
            next = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
            break;
          case "kitchen_prep":
            next = advanceToService(cycle, defaultDurations.serviceMs);
            break;
          case "service":
            next = advanceToDayEnd(cycle);
            break;
          case "day_end":
            return; // Nothing to skip
          default: {
            const _exhaustive: never = cycle.phase;
            return _exhaustive;
          }
        }

        this.registry.set("dayCycle", next);
        const targetScene = activeSceneForPhase(next.phase);
        this.scene.stop(this.callerScene);
        this.scene.start(targetScene);
        this.scene.stop();
      })
    );

    // Add 50 Coins
    this.menuObjects.push(
      addMenuButton(this, positions[1].x, positions[1].y, "Add 50 Coins", () => {
        const wallet: Wallet =
          this.registry.get("wallet") ?? initialWallet;
        this.registry.set("wallet", addCoins(wallet, 50));

        const feedback = this.add
          .text(centerX, 160, "+50 coins!", {
            fontFamily: "monospace",
            fontSize: "16px",
            color: "#4caf50",
          })
          .setOrigin(0.5);

        this.time.delayedCall(1_500, () => feedback.destroy());
      })
    );

    // Back
    this.menuObjects.push(
      addMenuButton(this, positions[2].x, positions[2].y, "Back", () => this.showMainMenu())
    );
  }

  private loadSlot(slot: SaveSlot): void {
    this.registry.set("activeSlotId", slot.id);
    this.registry.set("wallet", createWallet(slot.coins));
    const dayCycle: DayCycle = slot.phase !== undefined
      ? { day: slot.day, phase: slot.phase }
      : createDayCycle(slot.day);
    this.registry.set("dayCycle", dayCycle);
    this.registry.set("inventory", slot.inventory ?? createInventory());
    this.scene.stop(this.callerScene);
    this.scene.start(activeSceneForPhase(dayCycle.phase));
    this.scene.stop();
  }
}
