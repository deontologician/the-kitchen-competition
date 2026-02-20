import Phaser from "phaser";
import { renderPixelText } from "./renderPixelText";
import {
  initialWallet,
  formatCoins,
  spendCoins,
  type Wallet,
} from "../domain/wallet";
import {
  measureLineWidth,
  createDefaultLayoutConfig,
} from "../domain/pixel-font";
import { recordSceneEntry } from "./saveHelpers";
import { showTutorialHint } from "./tutorialHint";
import { renderTimerBar } from "./timerBar";
import { renderPanel } from "./panel";
import {
  getActiveRestaurantType,
  getActiveUnlockedCount,
  backgroundKey,
  backgroundAssetPath,
} from "./restaurantTypeHelper";
import {
  type DayCycle,
  tickTimer,
  isPhaseTimerExpired,
  advanceToKitchenPrep,
  defaultDurations,
} from "../domain/day-cycle";
import { unlockedGroceryItemsFor } from "../domain/menu";
import { findItem, type ItemDef } from "../domain/items";
import {
  createInventory,
  addItem,
  type Inventory,
} from "../domain/inventory";
import { timerBarVM } from "../domain/view/timer-vm";
import { groceryVM, type GroceryItemVM } from "../domain/view/grocery-vm";

// Grid layout constants
const GRID_LEFT = 60;
const GRID_TOP = 150;
const CELL_W = 90;
const CELL_H = 100;
const COLS = 8;
const ICON_SIZE = 48;

export class GroceryScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private itemButtons: Phaser.GameObjects.Container[] = [];
  private coinHudObjects: Phaser.GameObjects.GameObject[] = [];
  private groceryItems: ReadonlyArray<ItemDef> = [];

  constructor() {
    super("GroceryScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "grocery");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "grocery"));
    }

    // Preload item sprites for this restaurant type's unlocked dishes
    const unlocked = getActiveUnlockedCount(this.registry);
    const itemIds = unlockedGroceryItemsFor(type, unlocked);
    itemIds.forEach((id) => {
      const spriteKey = `item-${id}`;
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, `assets/items/${id}.png`);
      }
    });
  }

  create(): void {
    recordSceneEntry(this.registry, "GroceryScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "grocery"))
      .setDisplaySize(w, h);

    renderPanel(this, {
      marginTop: 80,
      marginBottom: 40,
      marginLeft: 40,
      marginRight: 40,
    });

    renderPixelText(this, ["GROCERY STORE"], { centerY: 110 });

    // Build grocery item list (only ingredients for unlocked dishes)
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const groceryIds = unlockedGroceryItemsFor(type, unlockedCount);
    this.groceryItems = groceryIds
      .map((id) => findItem(id))
      .filter((item): item is ItemDef => item !== undefined);

    this.renderItemGrid();
    this.renderCoinHud();
    showTutorialHint(this, "grocery");

    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.pause();
      this.scene.launch("PauseScene", { callerScene: "GroceryScene" });
    });
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined || cycle.phase.tag !== "grocery") return;

    const updated = tickTimer(cycle, delta);
    this.registry.set("dayCycle", updated);
    if (updated.phase.tag !== "grocery") return;

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const vm = timerBarVM(updated.phase, updated.day);
    if (vm !== undefined) {
      const result = renderTimerBar(this, 100, 50, 600, 24, vm.fraction, {
        label: vm.label,
      });
      this.timerGraphics = result.graphics;
      this.timerLabel = result.label;
    }

    if (isPhaseTimerExpired(updated)) {
      const next = advanceToKitchenPrep(
        updated,
        defaultDurations.kitchenPrepMs
      );
      this.registry.set("dayCycle", next);
      this.scene.start("KitchenScene");
    }
  }

  private renderItemGrid(): void {
    // Clean up old buttons
    this.itemButtons.forEach((c) => c.destroy());
    this.itemButtons = [];

    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const vm = groceryVM(wallet, inv, type, unlockedCount);

    vm.items.forEach((item, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = GRID_LEFT + col * CELL_W + CELL_W / 2;
      const y = GRID_TOP + row * CELL_H + CELL_H / 2;

      const container = this.add.container(x, y);

      // Background card
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a2e, 0.85);
      bg.fillRoundedRect(
        -CELL_W / 2 + 4,
        -CELL_H / 2 + 4,
        CELL_W - 8,
        CELL_H - 8,
        6
      );
      container.add(bg);

      // Item sprite
      if (this.textures.exists(item.spriteKey)) {
        const sprite = this.add
          .image(0, -14, item.spriteKey)
          .setDisplaySize(ICON_SIZE, ICON_SIZE);
        container.add(sprite);
      }

      // Item name (truncated via VM)
      const nameText = this.add
        .text(0, 18, item.displayName, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#cccccc",
        })
        .setOrigin(0.5);
      container.add(nameText);

      // Cost label
      const costText = this.add
        .text(0, 32, `$${item.cost}`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#4caf50",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      container.add(costText);

      // Count badge (how many in inventory)
      const countText = this.add
        .text(CELL_W / 2 - 12, -CELL_H / 2 + 8, item.count > 0 ? `${item.count}` : "", {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#f5a623",
          fontStyle: "bold",
          backgroundColor: item.count > 0 ? "#1a1a2e" : undefined,
          padding: item.count > 0 ? { x: 3, y: 1 } : undefined,
        })
        .setOrigin(0.5);
      container.add(countText);

      // Make the whole cell interactive
      const hitZone = this.add
        .zone(0, 0, CELL_W - 8, CELL_H - 8)
        .setInteractive({ useHandCursor: true });
      container.add(hitZone);

      hitZone.on("pointerover", () => {
        bg.clear();
        bg.fillStyle(0x2a2a4e, 0.95);
        bg.fillRoundedRect(
          -CELL_W / 2 + 4,
          -CELL_H / 2 + 4,
          CELL_W - 8,
          CELL_H - 8,
          6
        );
      });

      hitZone.on("pointerout", () => {
        bg.clear();
        bg.fillStyle(0x1a1a2e, 0.85);
        bg.fillRoundedRect(
          -CELL_W / 2 + 4,
          -CELL_H / 2 + 4,
          CELL_W - 8,
          CELL_H - 8,
          6
        );
      });

      hitZone.on("pointerdown", () => {
        this.buyItem(item);
      });

      this.itemButtons.push(container);
    });
  }

  private buyItem(item: GroceryItemVM): void {
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const newWallet = spendCoins(wallet, item.cost);
    if (newWallet === undefined) return; // can't afford

    this.registry.set("wallet", newWallet);

    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const newInv = addItem(inv, item.itemId, Date.now());
    this.registry.set("inventory", newInv);

    // Refresh display
    this.renderItemGrid();
    this.renderCoinHud();
  }

  private renderCoinHud(): void {
    this.coinHudObjects.forEach((obj) => obj.destroy());
    this.coinHudObjects = [];

    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const coinText = formatCoins(wallet);
    const config = createDefaultLayoutConfig();
    const textWidth = measureLineWidth(coinText, config) * config.pixelSize;

    // Use a simple Phaser text for the HUD so we can track and destroy it
    const hud = this.add
      .text(this.scale.width - 20, 20, `$${wallet.coins}`, {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#f5a623",
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0);
    this.coinHudObjects.push(hud);
  }
}
