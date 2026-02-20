import Phaser from "phaser";
import { addMenuButton } from "./renderPixelText";
import { type Wallet, createWallet } from "../domain/wallet";
import {
  type SaveStore,
  type RestaurantType,
  serializeStore,
  loadStore,
  findMostRecent,
  addSlot,
  createSaveSlot,
  findSlot,
  updateSlot,
  createSaveStore,
} from "../domain/save-slots";
import { SAVE_KEY } from "../domain/save-game";
import { createDayCycle, type DayCycle } from "../domain/day-cycle";
import { recordDayAdvance } from "./saveHelpers";

export class TitleScene extends Phaser.Scene {
  private _autoSaveRegistered = false;

  constructor() {
    super("TitleScene");
  }

  preload(): void {
    this.load.image("title-bg", "assets/title-bg.png");
    this.load.image("title-text", "assets/title-text.png");
  }

  create(): void {
    this.initStore();
    this.registerAutoSave();
    this.renderBackground();
    this.showMainMenu();
  }

  private initStore(): void {
    if (this.registry.has("saveStore")) return;
    const raw = localStorage.getItem(SAVE_KEY);
    const store = loadStore(raw, crypto.randomUUID(), Date.now());
    this.registry.set("saveStore", store);
  }

  private registerAutoSave(): void {
    if (this._autoSaveRegistered) return;
    this._autoSaveRegistered = true;

    this.registry.events.on(
      "changedata-wallet",
      (_parent: unknown, value: Wallet) => {
        const store: SaveStore | undefined = this.registry.get("saveStore");
        const activeSlotId: string | undefined =
          this.registry.get("activeSlotId");
        if (store === undefined || activeSlotId === undefined) return;

        const slot = findSlot(store, activeSlotId);
        if (slot === undefined) return;

        const updated = createSaveSlot(
          slot.id,
          slot.restaurantType,
          slot.day,
          value.coins,
          slot.scene,
          Date.now()
        );
        this.registry.set("saveStore", updateSlot(store, updated));
      }
    );

    this.registry.events.on(
      "changedata-saveStore",
      (_parent: unknown, value: SaveStore) => {
        localStorage.setItem(SAVE_KEY, serializeStore(value));
      }
    );

    this.registry.events.on(
      "changedata-dayCycle",
      (_parent: unknown, value: DayCycle) => {
        recordDayAdvance(this.registry, value.day);
      }
    );
  }

  private renderBackground(): void {
    this.add
      .image(this.scale.width / 2, this.scale.height / 2, "title-bg")
      .setDisplaySize(this.scale.width, this.scale.height);

    const titleImg = this.add.image(this.scale.width / 2, 180, "title-text");
    titleImg.setScale(
      Math.min(1, (this.scale.width * 0.8) / titleImg.width)
    );
  }

  private showMainMenu(): void {
    const store: SaveStore =
      this.registry.get("saveStore") ?? createSaveStore();
    const hasSaves = store.slots.length > 0;

    const centerX = this.scale.width / 2;
    let buttonY = 360;
    const spacing = 50;

    const menuObjects: Phaser.GameObjects.GameObject[] = [];

    menuObjects.push(
      addMenuButton(this, centerX, buttonY, "New Game", () => {
        menuObjects.forEach((obj) => obj.destroy());
        this.showRestaurantSelect();
      })
    );
    buttonY += spacing;

    if (hasSaves) {
      menuObjects.push(
        addMenuButton(this, centerX, buttonY, "Continue", () => {
          const current: SaveStore =
            this.registry.get("saveStore") ?? createSaveStore();
          const recent = findMostRecent(current);
          if (recent === undefined) return;
          this.registry.set("activeSlotId", recent.id);
          this.registry.set("wallet", createWallet(recent.coins));
          this.registry.set("dayCycle", createDayCycle(recent.day));
          this.scene.start("GroceryScene");
        })
      );
      buttonY += spacing;

      menuObjects.push(
        addMenuButton(this, centerX, buttonY, "Load Game", () => {
          this.scene.start("LoadGameScene");
        })
      );
    }
  }

  private showRestaurantSelect(): void {
    const centerX = this.scale.width / 2;
    let buttonY = 340;
    const spacing = 50;

    const selectObjects: Phaser.GameObjects.GameObject[] = [];

    const types: ReadonlyArray<{
      readonly type: RestaurantType;
      readonly label: string;
    }> = [
      { type: "burger", label: "Burger Joint (Easy)" },
      { type: "bbq", label: "BBQ (Medium)" },
      { type: "sushi", label: "Sushi (Hard)" },
    ];

    types.forEach(({ type, label }) => {
      selectObjects.push(
        addMenuButton(this, centerX, buttonY, label, () => {
          this.startNewGame(type);
        })
      );
      buttonY += spacing;
    });

    selectObjects.push(
      addMenuButton(this, centerX, buttonY, "Back", () => {
        selectObjects.forEach((obj) => obj.destroy());
        this.showMainMenu();
      })
    );
  }

  private startNewGame(type: RestaurantType): void {
    const id = crypto.randomUUID();
    const now = Date.now();
    const slot = createSaveSlot(id, type, 1, 10, "GroceryScene", now);
    const store: SaveStore =
      this.registry.get("saveStore") ?? createSaveStore();
    this.registry.set("saveStore", addSlot(store, slot));
    this.registry.set("activeSlotId", id);
    this.registry.set("wallet", createWallet(10));
    this.registry.set("dayCycle", createDayCycle(1));
    this.scene.start("GroceryScene");
  }
}
