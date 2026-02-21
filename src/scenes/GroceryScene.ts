import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import {
  initialWallet,
  formatCoins,
  spendCoins,
  type Wallet,
} from "../domain/wallet";
import { recordSceneEntry } from "./saveHelpers";
import { showTutorialHint } from "./tutorialHint";
import { renderTimerBar } from "./timerBar";
import { renderPanel } from "./panel";
import {
  getActiveRestaurantType,
  getActiveUnlockedCount,
  getActiveDisabledDishes,
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
import {
  enabledGroceryItemsFor,
  unlockedDishIdsFor,
  unlockedMenuFor,
} from "../domain/menu";
import {
  type SaveStore,
  type SaveSlot,
  findSlot,
  updateSlot,
  toggleDish,
} from "../domain/save-slots";
import type { SlotId } from "../domain/branded";
import { findItem, type ItemDef } from "../domain/items";
import {
  createInventory,
  addItem,
  type Inventory,
} from "../domain/inventory";
import { timerBarVM } from "../domain/view/timer-vm";
import { groceryVM, type GroceryItemVM } from "../domain/view/grocery-vm";
import {
  canvas,
  timerBar,
  sceneTitleY,
  skipButtonPos,
  coinHudPos,
  groceryGrid,
  GROCERY_CELL_W,
  GROCERY_CELL_H,
  GROCERY_ICON_SIZE,
} from "../domain/view/scene-layout";

export class GroceryScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private itemButtons: Phaser.GameObjects.Container[] = [];
  private coinHudObjects: Phaser.GameObjects.GameObject[] = [];
  private groceryItems: ReadonlyArray<ItemDef> = [];
  private menuPanel?: Phaser.GameObjects.Container;

  constructor() {
    super("GroceryScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "grocery");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "grocery"));
    }

    // Preload item sprites for this restaurant type's enabled dishes
    const unlocked = getActiveUnlockedCount(this.registry);
    const disabled = getActiveDisabledDishes(this.registry);
    const itemIds = enabledGroceryItemsFor(type, unlocked, disabled);
    itemIds.forEach((id) => {
      const spriteKey = `item-${id}`;
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, `assets/items/${id}.png`);
      }
    });

    // Also preload dish sprites for the menu panel
    const dishIds = unlockedDishIdsFor(type, unlocked);
    dishIds.forEach((id) => {
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

    renderPixelText(this, ["GROCERY STORE"], { centerY: sceneTitleY });

    // Build grocery item list (only ingredients for enabled dishes)
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabledDishes = getActiveDisabledDishes(this.registry);
    const groceryIds = enabledGroceryItemsFor(type, unlockedCount, disabledDishes);
    this.groceryItems = groceryIds
      .map((id) => findItem(id))
      .filter((item): item is ItemDef => item !== undefined);

    this.renderItemGrid();
    this.renderCoinHud();
    showTutorialHint(this, "grocery");

    // Menu toggle button (top-left)
    const menuBtnX = 60;
    const menuBtnY = 20;
    addMenuButton(this, menuBtnX, menuBtnY, "MENU \u25BC", () => {
      if (this.menuPanel !== undefined) {
        this.closeMenuPanel();
      } else {
        this.showMenuPanel();
      }
    });

    // Skip-ahead button
    addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "Done Shopping \u25B6", () => {
      const current: DayCycle | undefined = this.registry.get("dayCycle");
      if (current === undefined || current.phase.tag !== "grocery") return;
      const next = advanceToKitchenPrep(current, defaultDurations.kitchenPrepMs);
      this.registry.set("dayCycle", next);
      this.scene.start("KitchenScene");
    });

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
      const result = renderTimerBar(
        this,
        timerBar.x, timerBar.y, timerBar.width, timerBar.height,
        vm.fraction,
        { label: vm.label }
      );
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

  private closeMenuPanel(): void {
    this.menuPanel?.destroy();
    this.menuPanel = undefined;
  }

  private showMenuPanel(): void {
    this.closeMenuPanel();

    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabledDishes = getActiveDisabledDishes(this.registry);

    const dishIds = unlockedDishIdsFor(type, unlockedCount);
    const menu = unlockedMenuFor(type, unlockedCount);

    const panelW = 440;
    const rowH = 54;
    const panelH = 60 + dishIds.length * rowH + 16;
    const panelX = (canvas.width - panelW) / 2;
    const panelY = (canvas.height - panelH) / 2;

    const container = this.add.container(0, 0);
    this.menuPanel = container;

    // Dim overlay (click to close)
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, canvas.width, canvas.height);
    overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, canvas.width, canvas.height),
      Phaser.Geom.Rectangle.Contains
    );
    overlay.on("pointerdown", () => this.closeMenuPanel());
    container.add(overlay);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x0d0d1a, 0.97);
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, 10);
    bg.lineStyle(2, 0x444466, 1);
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 10);
    container.add(bg);

    // Title
    const title = this.add
      .text(panelX + panelW / 2, panelY + 24, "TODAY'S MENU", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#f5a623",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    container.add(title);

    // Close button
    const closeBtn = this.add
      .text(panelX + panelW - 16, panelY + 14, "\u2715", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#888899",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerover", () => closeBtn.setColor("#ffffff"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#888899"));
    closeBtn.on("pointerdown", () => this.closeMenuPanel());
    container.add(closeBtn);

    // Dish rows
    dishIds.forEach((dishId, i) => {
      const rowY = panelY + 52 + i * rowH;
      const isEnabled = !disabledDishes.includes(dishId);
      const dishItem = findItem(dishId);
      const dishName = dishItem?.name ?? dishId;
      const menuItem = menu.items.find((mi) => mi.dishId === dishId);

      // Row bg
      const rowBg = this.add.graphics();
      const rowBgColor = isEnabled ? 0x1a2e1a : 0x2e1a1a;
      rowBg.fillStyle(rowBgColor, 0.7);
      rowBg.fillRoundedRect(panelX + 10, rowY, panelW - 20, rowH - 6, 6);
      container.add(rowBg);

      // Dish sprite
      const spriteKey = `item-${dishId}`;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add
          .image(panelX + 36, rowY + (rowH - 6) / 2, spriteKey)
          .setDisplaySize(36, 36)
          .setAlpha(isEnabled ? 1 : 0.35);
        container.add(sprite);
      }

      // Dish name
      const nameText = this.add
        .text(panelX + 62, rowY + (rowH - 6) / 2 - 8, dishName, {
          fontFamily: "monospace",
          fontSize: "12px",
          color: isEnabled ? "#e0e0e0" : "#888888",
          fontStyle: isEnabled ? "bold" : "normal",
        })
        .setOrigin(0, 0.5);
      container.add(nameText);

      // Price info
      if (menuItem !== undefined) {
        const priceText = this.add
          .text(panelX + 62, rowY + (rowH - 6) / 2 + 8, `$${menuItem.sellPrice} each`, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#666677",
          })
          .setOrigin(0, 0.5);
        container.add(priceText);
      }

      // ON/OFF toggle
      const toggleLabel = isEnabled ? "ON" : "OFF";
      const toggleColor = isEnabled ? "#4caf50" : "#f44336";
      const toggleText = this.add
        .text(panelX + panelW - 26, rowY + (rowH - 6) / 2, toggleLabel, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: toggleColor,
          fontStyle: "bold",
          backgroundColor: "#1a1a2e",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });

      // Hit zone for the whole row
      const rowHit = this.add
        .zone(panelX + 10, rowY, panelW - 20, rowH - 6)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      const handleToggle = (): void => {
        const store: SaveStore | undefined = this.registry.get("saveStore");
        const activeSlotId: SlotId | undefined = this.registry.get("activeSlotId");
        if (store === undefined || activeSlotId === undefined) return;
        const slot: SaveSlot | undefined = findSlot(store, activeSlotId);
        if (slot === undefined) return;

        const currentDisabled = slot.disabledDishes ?? [];
        const currentlyEnabled = dishIds.filter((id) => !currentDisabled.includes(id));
        const updated = toggleDish(slot, dishId, [...currentlyEnabled]);
        this.registry.set("saveStore", updateSlot(store, updated));

        // Re-render grocery grid and reopen panel
        this.renderItemGrid();
        this.showMenuPanel();
      };

      rowHit.on("pointerover", () => {
        rowBg.clear();
        rowBg.fillStyle(isEnabled ? 0x244424 : 0x442424, 0.9);
        rowBg.fillRoundedRect(panelX + 10, rowY, panelW - 20, rowH - 6, 6);
      });
      rowHit.on("pointerout", () => {
        rowBg.clear();
        rowBg.fillStyle(rowBgColor, 0.7);
        rowBg.fillRoundedRect(panelX + 10, rowY, panelW - 20, rowH - 6, 6);
      });
      rowHit.on("pointerdown", handleToggle);
      toggleText.on("pointerdown", handleToggle);

      container.add([rowHit, toggleText]);
    });

    // Instruction hint
    const hint = this.add
      .text(panelX + panelW / 2, panelY + panelH - 14, "Click a dish to enable/disable it", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#555566",
      })
      .setOrigin(0.5, 1);
    container.add(hint);
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
    const disabledDishes = getActiveDisabledDishes(this.registry);
    const vm = groceryVM(wallet, inv, type, unlockedCount, disabledDishes);

    const cells = groceryGrid(vm.items.length);

    vm.items.forEach((item, i) => {
      const cell = cells[i];
      const container = this.add.container(cell.x, cell.y);

      // Background card
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a2e, 0.85);
      bg.fillRoundedRect(
        -GROCERY_CELL_W / 2 + 4,
        -GROCERY_CELL_H / 2 + 4,
        GROCERY_CELL_W - 8,
        GROCERY_CELL_H - 8,
        6
      );
      container.add(bg);

      // Item sprite
      if (this.textures.exists(item.spriteKey)) {
        const sprite = this.add
          .image(0, -14, item.spriteKey)
          .setDisplaySize(GROCERY_ICON_SIZE, GROCERY_ICON_SIZE);
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
        .text(GROCERY_CELL_W / 2 - 12, -GROCERY_CELL_H / 2 + 8, item.count > 0 ? `${item.count}` : "", {
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
        .zone(0, 0, GROCERY_CELL_W - 8, GROCERY_CELL_H - 8)
        .setInteractive({ useHandCursor: true });
      container.add(hitZone);

      hitZone.on("pointerover", () => {
        bg.clear();
        bg.fillStyle(0x2a2a4e, 0.95);
        bg.fillRoundedRect(
          -GROCERY_CELL_W / 2 + 4,
          -GROCERY_CELL_H / 2 + 4,
          GROCERY_CELL_W - 8,
          GROCERY_CELL_H - 8,
          6
        );
      });

      hitZone.on("pointerout", () => {
        bg.clear();
        bg.fillStyle(0x1a1a2e, 0.85);
        bg.fillRoundedRect(
          -GROCERY_CELL_W / 2 + 4,
          -GROCERY_CELL_H / 2 + 4,
          GROCERY_CELL_W - 8,
          GROCERY_CELL_H - 8,
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

    const hud = this.add
      .text(coinHudPos.x, coinHudPos.y, `$${wallet.coins}`, {
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
