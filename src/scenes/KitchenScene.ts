import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
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
  isTimedPhase,
  advanceToService,
  advanceToDayEnd,
  movePlayer,
  defaultDurations,
} from "../domain/day-cycle";
import { enabledRecipesFor } from "../domain/menu";
import { findItem } from "../domain/items";
import type { RecipeStep } from "../domain/recipes";
import {
  createInventory,
  hasIngredientsFor,
  removeItemSet,
  removeExpired,
  itemCounts,
  type Inventory,
} from "../domain/inventory";
import {
  startCuttingBoardWork,
  setPlayerAtCuttingBoard,
  startPassiveStation,
  type KitchenServiceState,
  type KitchenOrder,
} from "../domain/kitchen-service";
import { timerBarVM } from "../domain/view/timer-vm";
import {
  kitchenVM,
  type ActiveRecipe,
  type RecipeVM,
} from "../domain/view/kitchen-vm";
import { kitchenServiceVM, type KitchenServiceVM } from "../domain/view/kitchen-service-vm";
import type { OrderId } from "../domain/branded";
import {
  timerBar,
  sceneTitleY,
  skipButtonPos,
  recipeRegion,
  recipeStack,
  kitchenInvRegion,
  RECIPE_ROW_H,
  RECIPE_ICON_SIZE,
  KITCHEN_INV_COL_W,
  KITCHEN_INV_ROW_H,
} from "../domain/view/scene-layout";

// Layout constants for service-mode station panel
const STATION_PANEL_X = 450;
const STATION_PANEL_Y = 95;
const STATION_W = 280;
const STATION_H = 100;
const STATION_GAP = 110;
const ORDER_UP_Y = 435;

export class KitchenScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private cookingTimer?: Phaser.Time.TimerEvent;
  private recipeButtons: Phaser.GameObjects.Container[] = [];
  private invObjects: Phaser.GameObjects.GameObject[] = [];
  private activeRecipe?: RecipeStep;
  private activeRowFill?: Phaser.GameObjects.Rectangle;
  private activeRowTimeText?: Phaser.GameObjects.Text;
  private recipeStartTime = 0;
  private scrollOffset: number = 0;
  private scrollContainer: Phaser.GameObjects.Container | null = null;
  private maskGraphics: Phaser.GameObjects.Graphics | null = null;
  private totalRecipeHeight: number = 0;
  private scrollArrowUp: Phaser.GameObjects.Text | null = null;
  private scrollArrowDown: Phaser.GameObjects.Text | null = null;

  // Service mode station UI
  private stationObjects: Phaser.GameObjects.GameObject[] = [];
  private lastStationKey = "";
  private cuttingBoardActive = false;
  private pendingCBOrderId: OrderId | undefined = undefined;

  constructor() {
    super("KitchenScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "kitchen");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "kitchen"));
    }

    const unlocked = getActiveUnlockedCount(this.registry);
    const disabled = getActiveDisabledDishes(this.registry);
    const recipes = enabledRecipesFor(type, unlocked, disabled);
    const itemIds = new Set<string>();
    recipes.forEach((r) => {
      itemIds.add(r.output);
      r.inputs.forEach((inp) => itemIds.add(inp.itemId));
    });
    itemIds.forEach((id) => {
      const spriteKey = `item-${id}`;
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, `assets/items/${id}.png`);
      }
    });
  }

  create(): void {
    this.cookingTimer?.destroy();
    this.cookingTimer = undefined;
    this.activeRecipe = undefined;
    this.recipeStartTime = 0;
    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;
    this.stationObjects = [];
    this.lastStationKey = "";
    this.cuttingBoardActive = false;
    this.pendingCBOrderId = undefined;

    recordSceneEntry(this.registry, "KitchenScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "kitchen"))
      .setDisplaySize(w, h);

    renderPanel(this, {
      marginTop: 80,
      marginBottom: 40,
      marginLeft: 40,
      marginRight: 40,
    });

    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    if (cycle.phase.tag === "kitchen_prep") {
      renderPixelText(this, ["THE KITCHEN"], { centerY: sceneTitleY });
      this.renderRecipeList();
      this.renderInventory();
      showTutorialHint(this, "kitchen_prep");

      addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "Done Prepping \u25B6", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (current === undefined || current.phase.tag !== "kitchen_prep") return;
        this.cookingTimer?.destroy();
        const next = advanceToService(current, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      });
    } else if (cycle.phase.tag === "service") {
      renderPixelText(this, ["THE KITCHEN"], { centerY: sceneTitleY });
      this.renderServiceKitchen(cycle.phase.kitchen);

      // "Go to Floor" button
      addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "\u25C4 Go to Floor", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (!current || current.phase.tag !== "service") return;
        const updated = movePlayer(current.phase, "floor");
        this.registry.set("dayCycle", { ...current, phase: updated });
        this.scene.start("RestaurantScene");
      });
    }

    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.pause();
      this.scene.launch("PauseScene", { callerScene: "KitchenScene" });
    });

    this.input.on(
      "wheel",
      (pointer: Phaser.Input.Pointer, _gameObjects: unknown, _dx: number, dy: number) => {
        const r = recipeRegion;
        if (
          pointer.x >= r.x &&
          pointer.x <= r.x + r.width &&
          pointer.y >= r.y &&
          pointer.y <= r.y + r.height
        ) {
          this.scrollOffset = Phaser.Math.Clamp(
            this.scrollOffset + dy * 0.5,
            0,
            this.maxScrollOffset
          );
          this.scrollContainer?.setY(-this.scrollOffset);
          this.updateScrollArrows();
        }
      }
    );
    this.events.once("shutdown", () => {
      this.input.off("wheel");
    });
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    if (cycle.phase.tag === "day_end") return;

    const updated = tickTimer(cycle, delta);
    this.registry.set("dayCycle", updated);
    if (!isTimedPhase(updated.phase)) return;

    // Expire inventory items
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const now = Date.now();
    const afterExpiry = removeExpired(inv, now);
    if (afterExpiry.items.length < inv.items.length) {
      this.registry.set("inventory", afterExpiry);
      if (updated.phase.tag === "kitchen_prep") {
        this.renderRecipeList();
        this.renderInventory();
      }
    }

    // Update inline cooking progress on active recipe row (prep mode)
    if (updated.phase.tag === "kitchen_prep" && this.activeRecipe !== undefined && this.activeRowFill) {
      const elapsed = Date.now() - this.recipeStartTime;
      const fraction = Math.min(1, elapsed / this.activeRecipe.timeMs);
      this.activeRowFill.width = recipeRegion.width * fraction;
      const remaining = Math.max(0, this.activeRecipe.timeMs - elapsed);
      this.activeRowTimeText?.setText(`${(remaining / 1000).toFixed(1)}s`);
    }

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

    // Service mode: update station UI
    if (updated.phase.tag === "service") {
      this.updateServiceStations(updated.phase.kitchen);
    }

    if (isPhaseTimerExpired(updated)) {
      if (updated.phase.tag === "kitchen_prep") {
        const next = advanceToService(updated, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      } else if (updated.phase.tag === "service") {
        this.cookingTimer?.destroy();
        const ended = advanceToDayEnd(updated);
        this.registry.set("dayCycle", ended);
        this.scene.start("RestaurantScene");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Service mode station rendering
  // ---------------------------------------------------------------------------

  private renderServiceKitchen(kitchen: KitchenServiceState): void {
    this.stationObjects.forEach((obj) => obj.destroy());
    this.stationObjects = [];

    const vm = kitchenServiceVM(kitchen);
    this.renderStationPanel(0, "Cutting Board", vm.cuttingBoard, kitchen, true);
    this.renderStationPanel(1, "Stove", vm.stove, kitchen, false);
    this.renderStationPanel(2, "Oven", vm.oven, kitchen, false);
    this.renderOrderUpPanel(vm, kitchen);
    this.renderPendingOrdersList(vm, kitchen);
  }

  private renderStationPanel(
    index: number,
    label: string,
    vm: import("../domain/view/kitchen-service-vm").StationVM,
    kitchen: KitchenServiceState,
    isCuttingBoard: boolean
  ): void {
    const x = STATION_PANEL_X;
    const y = STATION_PANEL_Y + index * STATION_GAP;
    const w = STATION_W;
    const h = STATION_H - 10;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(vm.tag === "idle" ? 0x1a1a2e : vm.tag === "working" ? 0x1a2e3a : 0x2e1a2e, 0.8);
    bg.fillRoundedRect(x, y, w, h, 6);
    this.stationObjects.push(bg);

    // Label
    this.stationObjects.push(
      this.add.text(x + 8, y + 6, label.toUpperCase(), {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#f5a623",
        fontStyle: "bold",
      })
    );

    if (vm.tag === "idle") {
      this.stationObjects.push(
        this.add.text(x + 8, y + 22, "Empty - assign an order", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#666677",
        })
      );
    } else {
      // Dish name
      this.stationObjects.push(
        this.add.text(x + 8, y + 22, vm.dishName ?? "", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#ccccff",
        })
      );

      // Progress bar
      const barX = x + 8;
      const barY = y + h - 16;
      const barW = w - 16;
      const barH = 8;
      const gfx = this.add.graphics();
      gfx.fillStyle(0x333344, 1);
      gfx.fillRoundedRect(barX, barY, barW, barH, 4);
      gfx.fillStyle(isCuttingBoard ? (vm.isPlayerActive ? 0x4caf50 : 0x888899) : 0x2196f3, 1);
      gfx.fillRoundedRect(barX, barY, barW * vm.progressFraction, barH, 4);
      this.stationObjects.push(gfx);

      // Sprite
      if (vm.dishSpriteKey && this.textures.exists(vm.dishSpriteKey)) {
        this.stationObjects.push(
          this.add.image(x + w - 28, y + h / 2 - 2, vm.dishSpriteKey).setDisplaySize(28, 28)
        );
      }

      // Cutting board: hold-to-work interaction
      if (isCuttingBoard && vm.tag === "working") {
        const hitZone = this.add
          .zone(x + w / 2, y + h / 2, w, h)
          .setInteractive({ useHandCursor: true });

        hitZone.on("pointerdown", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (!current || current.phase.tag !== "service") return;
          const newK = setPlayerAtCuttingBoard(current.phase.kitchen, true);
          this.registry.set("dayCycle", { ...current, phase: { ...current.phase, kitchen: newK } });
          this.cuttingBoardActive = true;
        });

        hitZone.on("pointerup", () => this.releaseCuttingBoard());
        hitZone.on("pointerout", () => this.releaseCuttingBoard());
        this.stationObjects.push(hitZone);

        const hint = vm.isPlayerActive ? "HOLD to work ▶" : "HOLD to work";
        this.stationObjects.push(
          this.add.text(x + 8, y + 38, hint, {
            fontFamily: "monospace",
            fontSize: "9px",
            color: vm.isPlayerActive ? "#4caf50" : "#888899",
          })
        );
      }
    }
  }

  private releaseCuttingBoard(): void {
    if (!this.cuttingBoardActive) return;
    this.cuttingBoardActive = false;
    const current: DayCycle | undefined = this.registry.get("dayCycle");
    if (!current || current.phase.tag !== "service") return;
    const newK = setPlayerAtCuttingBoard(current.phase.kitchen, false);
    this.registry.set("dayCycle", { ...current, phase: { ...current.phase, kitchen: newK } });
  }

  private renderOrderUpPanel(vm: KitchenServiceVM, _kitchen: KitchenServiceState): void {
    const x = STATION_PANEL_X;
    const y = ORDER_UP_Y;
    const w = STATION_W;
    const h = 50;

    const bg = this.add.graphics();
    bg.fillStyle(vm.orderUp.length > 0 ? 0x1a3a1a : 0x1a1a2e, 0.8);
    bg.fillRoundedRect(x, y, w, h, 6);
    this.stationObjects.push(bg);

    this.stationObjects.push(
      this.add.text(x + 8, y + 6, "ORDER UP", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: vm.orderUp.length > 0 ? "#4caf50" : "#666677",
        fontStyle: "bold",
      })
    );

    if (vm.orderUp.length === 0) {
      this.stationObjects.push(
        this.add.text(x + 8, y + 24, "No orders ready", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#666677",
        })
      );
    } else {
      const names = vm.orderUp.map((o) => o.dishName).join(", ");
      this.stationObjects.push(
        this.add.text(x + 8, y + 24, `Ready: ${names}`, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#4caf50",
        })
      );
    }
  }

  private renderPendingOrdersList(vm: KitchenServiceVM, kitchen: KitchenServiceState): void {
    const listX = STATION_PANEL_X;
    const listY = ORDER_UP_Y + 58;

    this.stationObjects.push(
      this.add.text(listX, listY, "PENDING ORDERS:", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#f5a623",
        fontStyle: "bold",
      })
    );

    if (vm.pendingOrders.length === 0) {
      this.stationObjects.push(
        this.add.text(listX, listY + 16, "(none)", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#666677",
        })
      );
      return;
    }

    const isStoveIdle = kitchen.stove.tag === "idle";
    const isOvenIdle = kitchen.oven.tag === "idle";
    const isCBIdle = kitchen.cuttingBoard.tag === "idle";

    vm.pendingOrders.forEach((order, i) => {
      const rowY = listY + 16 + i * 32;

      // Sprite
      if (order.dishSpriteKey && this.textures.exists(order.dishSpriteKey)) {
        this.stationObjects.push(
          this.add.image(listX + 12, rowY + 8, order.dishSpriteKey).setDisplaySize(18, 18)
        );
      }

      this.stationObjects.push(
        this.add.text(listX + 26, rowY + 4, order.dishName, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#ccccff",
        })
      );

      // Assign buttons
      let btnX = listX + 26;
      const btnY = rowY + 18;
      const oid = order.orderId;

      if (isCBIdle) {
        const cbBtn = this.add.text(btnX, btnY, "[Cutting Board]", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#2196f3",
          backgroundColor: "#11112e",
          padding: { x: 4, y: 2 },
        }).setInteractive({ useHandCursor: true });
        cbBtn.on("pointerover", () => cbBtn.setColor("#66aaff"));
        cbBtn.on("pointerout", () => cbBtn.setColor("#2196f3"));
        cbBtn.on("pointerdown", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (!current || current.phase.tag !== "service") return;
          const DEFAULT_CB_DURATION = 8_000; // 8s for now
          const newK = startCuttingBoardWork(current.phase.kitchen, oid, DEFAULT_CB_DURATION);
          this.registry.set("dayCycle", { ...current, phase: { ...current.phase, kitchen: newK } });
          this.pendingCBOrderId = oid;
          this.forceStationRefresh();
        });
        this.stationObjects.push(cbBtn);
        btnX += 100;
      }

      if (isStoveIdle) {
        const stoveBtn = this.add.text(btnX, btnY, "[Stove]", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#ff9800",
          backgroundColor: "#2e1a00",
          padding: { x: 4, y: 2 },
        }).setInteractive({ useHandCursor: true });
        stoveBtn.on("pointerover", () => stoveBtn.setColor("#ffcc66"));
        stoveBtn.on("pointerout", () => stoveBtn.setColor("#ff9800"));
        stoveBtn.on("pointerdown", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (!current || current.phase.tag !== "service") return;
          const newK = startPassiveStation(current.phase.kitchen, "stove", oid, 15_000);
          this.registry.set("dayCycle", { ...current, phase: { ...current.phase, kitchen: newK } });
          this.forceStationRefresh();
        });
        this.stationObjects.push(stoveBtn);
        btnX += 60;
      }

      if (isOvenIdle) {
        const ovenBtn = this.add.text(btnX, btnY, "[Oven]", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#e91e63",
          backgroundColor: "#2e001a",
          padding: { x: 4, y: 2 },
        }).setInteractive({ useHandCursor: true });
        ovenBtn.on("pointerover", () => ovenBtn.setColor("#ff66aa"));
        ovenBtn.on("pointerout", () => ovenBtn.setColor("#e91e63"));
        ovenBtn.on("pointerdown", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (!current || current.phase.tag !== "service") return;
          const newK = startPassiveStation(current.phase.kitchen, "oven", oid, 20_000);
          this.registry.set("dayCycle", { ...current, phase: { ...current.phase, kitchen: newK } });
          this.forceStationRefresh();
        });
        this.stationObjects.push(ovenBtn);
      }
    });
  }

  private forceStationRefresh(): void {
    this.lastStationKey = "";
  }

  private updateServiceStations(kitchen: KitchenServiceState): void {
    const vm = kitchenServiceVM(kitchen);
    const key = JSON.stringify({
      cb: vm.cuttingBoard.tag,
      cbProgress: Math.floor((vm.cuttingBoard.progressFraction ?? 0) * 20),
      cbActive: vm.cuttingBoard.isPlayerActive,
      stove: vm.stove.tag,
      stoveProgress: Math.floor((vm.stove.progressFraction ?? 0) * 20),
      oven: vm.oven.tag,
      ovenProgress: Math.floor((vm.oven.progressFraction ?? 0) * 20),
      pending: vm.pendingOrders.length,
      orderUp: vm.orderUp.length,
    });

    if (key === this.lastStationKey) return;
    this.lastStationKey = key;
    this.renderServiceKitchen(kitchen);
  }

  // ---------------------------------------------------------------------------
  // Kitchen prep mode rendering (unchanged)
  // ---------------------------------------------------------------------------

  private renderRecipeList(): void {
    if (this.scrollContainer) {
      this.scrollContainer.destroy(true);
      this.scrollContainer = null;
    }
    if (this.maskGraphics) {
      this.maskGraphics.destroy();
      this.maskGraphics = null;
    }
    this.scrollArrowUp?.destroy();
    this.scrollArrowUp = null;
    this.scrollArrowDown?.destroy();
    this.scrollArrowDown = null;
    this.recipeButtons = [];
    this.scrollOffset = 0;

    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabledDishes = getActiveDisabledDishes(this.registry);
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();

    const activeRecipeState: ActiveRecipe | undefined =
      this.activeRecipe !== undefined
        ? { step: this.activeRecipe, startedAt: this.recipeStartTime }
        : undefined;

    const vm = kitchenVM(inv, type, unlockedCount, activeRecipeState, Date.now(), disabledDishes);
    const isBusy = this.activeRecipe !== undefined;

    const sortedRecipes = [...vm.recipes].sort((a, b) => {
      const aCanMake = a.canMake ? 0 : 1;
      const bCanMake = b.canMake ? 0 : 1;
      return aCanMake - bCanMake;
    });

    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;

    this.totalRecipeHeight = sortedRecipes.length * RECIPE_ROW_H;
    this.scrollContainer = this.add.container(0, 0);

    const positions = recipeStack(sortedRecipes.length);
    const rowWidth = recipeRegion.width;

    sortedRecipes.forEach((recipe, i) => {
      const pos = positions[i];
      const container = this.add.container(pos.x, pos.y);
      const isActiveRow = recipe.stepId === this.activeRecipe?.id;

      const bgColor = isActiveRow ? 0x1a1a3e : recipe.canMake ? 0x1a2e1a : 0x1a1a2e;
      const bgAlpha = isActiveRow ? 0.85 : recipe.canMake && !isBusy ? 0.85 : 0.5;
      const bg = this.add.graphics();
      bg.fillStyle(bgColor, bgAlpha);
      bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, rowWidth, RECIPE_ROW_H - 4, 4);
      container.add(bg);

      if (isActiveRow) {
        const elapsed = Date.now() - this.recipeStartTime;
        const fraction = Math.min(1, elapsed / this.activeRecipe!.timeMs);
        const fill = this.add.rectangle(
          0, 0,
          rowWidth * fraction, RECIPE_ROW_H - 4,
          0x2196f3, 0.3
        ).setOrigin(0, 0.5);
        container.add(fill);
        this.activeRowFill = fill;
      }

      if (this.textures.exists(recipe.outputSpriteKey)) {
        const sprite = this.add
          .image(22, 0, recipe.outputSpriteKey)
          .setDisplaySize(RECIPE_ICON_SIZE, RECIPE_ICON_SIZE);
        container.add(sprite);
      }

      const nameColor = isActiveRow ? "#2196f3" : recipe.canMake ? "#4caf50" : "#666677";
      const nameText = this.add
        .text(46, -10, recipe.outputName, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: nameColor,
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      container.add(nameText);

      const inputsStr = recipe.inputs
        .map((inp) =>
          `${inp.isShort ? "!" : ""}${inp.name}(${inp.have}/${inp.need})`
        )
        .join(" ");
      const inputsText = this.add
        .text(46, 8, inputsStr, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#888899",
        })
        .setOrigin(0, 0.5);
      container.add(inputsText);

      if (isActiveRow) {
        const remaining = Math.max(0, this.activeRecipe!.timeMs - (Date.now() - this.recipeStartTime));
        const timeText = this.add
          .text(rowWidth - 10, 0, `${(remaining / 1000).toFixed(1)}s`, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#2196f3",
          })
          .setOrigin(1, 0.5);
        container.add(timeText);
        this.activeRowTimeText = timeText;
      } else {
        const timeStr = `${recipe.timeSeconds.toFixed(0)}s`;
        const timeText = this.add
          .text(rowWidth - 10, 0, timeStr, {
            fontFamily: "monospace",
            fontSize: "10px",
            color: "#f5a623",
          })
          .setOrigin(1, 0.5);
        container.add(timeText);
      }

      if (recipe.canMake && !isBusy) {
        const hitZone = this.add
          .zone(rowWidth / 2, 0, rowWidth, RECIPE_ROW_H - 4)
          .setInteractive({ useHandCursor: true });
        container.add(hitZone);

        hitZone.on("pointerover", () => {
          bg.clear();
          bg.fillStyle(0x2a4e2a, 0.95);
          bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, rowWidth, RECIPE_ROW_H - 4, 4);
        });
        hitZone.on("pointerout", () => {
          bg.clear();
          bg.fillStyle(0x1a2e1a, bgAlpha);
          bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, rowWidth, RECIPE_ROW_H - 4, 4);
        });
        hitZone.on("pointerdown", () => {
          this.startRecipeByStepId(recipe.stepId);
        });
      }

      this.scrollContainer!.add(container);
    });

    this.maskGraphics = this.make.graphics({}, false);
    this.maskGraphics.fillStyle(0xffffff);
    this.maskGraphics.fillRect(
      recipeRegion.x,
      recipeRegion.y,
      recipeRegion.width,
      recipeRegion.height
    );
    const mask = this.maskGraphics.createGeometryMask();
    this.scrollContainer.setMask(mask);

    if (this.totalRecipeHeight > recipeRegion.height) {
      this.scrollArrowUp = this.add
        .text(recipeRegion.x + recipeRegion.width - 4, recipeRegion.y + 4, "▲", {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#aaaacc",
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      this.scrollArrowUp.on("pointerdown", () => {
        this.scrollOffset = Phaser.Math.Clamp(
          this.scrollOffset - RECIPE_ROW_H,
          0,
          this.maxScrollOffset
        );
        this.scrollContainer?.setY(-this.scrollOffset);
        this.updateScrollArrows();
      });

      this.scrollArrowDown = this.add
        .text(
          recipeRegion.x + recipeRegion.width - 4,
          recipeRegion.y + recipeRegion.height - 4,
          "▼",
          {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#aaaacc",
          }
        )
        .setOrigin(1, 1)
        .setInteractive({ useHandCursor: true });
      this.scrollArrowDown.on("pointerdown", () => {
        this.scrollOffset = Phaser.Math.Clamp(
          this.scrollOffset + RECIPE_ROW_H,
          0,
          this.maxScrollOffset
        );
        this.scrollContainer?.setY(-this.scrollOffset);
        this.updateScrollArrows();
      });

      this.updateScrollArrows();
    }
  }

  private get maxScrollOffset(): number {
    return Math.max(0, this.totalRecipeHeight - recipeRegion.height);
  }

  private updateScrollArrows(): void {
    this.scrollArrowUp?.setVisible(this.scrollOffset > 0);
    this.scrollArrowDown?.setVisible(this.scrollOffset < this.maxScrollOffset);
  }

  private startRecipeByStepId(stepId: string): void {
    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabled = getActiveDisabledDishes(this.registry);
    const recipes = enabledRecipesFor(type, unlockedCount, disabled);
    const recipe = recipes.find((r) => r.id === stepId);
    if (recipe !== undefined) {
      this.startRecipe(recipe);
    }
  }

  private startRecipe(recipe: RecipeStep): void {
    if (this.activeRecipe !== undefined) return;

    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    if (!hasIngredientsFor(inv, recipe)) return;

    const afterConsume = removeItemSet(inv, recipe.inputs);
    if (afterConsume === undefined) return;

    this.activeRecipe = recipe;
    this.recipeStartTime = Date.now();
    this.registry.set("inventory", afterConsume);

    this.renderRecipeList();
    this.renderInventory();

    if (recipe.timeMs <= 0) {
      this.finishRecipe(recipe);
    } else {
      this.cookingTimer = this.time.delayedCall(recipe.timeMs, () => {
        this.finishRecipe(recipe);
      });
    }
  }

  private finishRecipe(recipe: RecipeStep): void {
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const updated: Inventory = {
      items: [...inv.items, { itemId: recipe.output, createdAt: Date.now() }],
    };
    this.registry.set("inventory", updated);

    this.activeRecipe = undefined;
    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;

    this.renderRecipeList();
    this.renderInventory();
  }

  private renderInventory(): void {
    this.invObjects.forEach((obj) => obj.destroy());
    this.invObjects = [];

    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const counts = itemCounts(inv);

    const title = this.add
      .text(kitchenInvRegion.x, kitchenInvRegion.y - 20, "INVENTORY", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f5a623",
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0);
    this.invObjects.push(title);

    counts.forEach((entry, i) => {
      const col = Math.floor(i / 12);
      const row = i % 12;
      const x = kitchenInvRegion.x + col * KITCHEN_INV_COL_W * 2;
      const y = kitchenInvRegion.y + 10 + row * KITCHEN_INV_ROW_H;

      const item = findItem(entry.itemId);
      const name = item?.name ?? entry.itemId;
      const shortName = name.length > 14 ? name.slice(0, 13) + "." : name;

      const spriteKey = `item-${entry.itemId}`;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add
          .image(x, y + 10, spriteKey)
          .setDisplaySize(20, 20);
        this.invObjects.push(sprite);
      }

      const text = this.add
        .text(x + 14, y + 10, `${shortName} x${entry.count}`, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#cccccc",
        })
        .setOrigin(0, 0.5);
      this.invObjects.push(text);
    });

    if (counts.length === 0) {
      const empty = this.add
        .text(kitchenInvRegion.x, kitchenInvRegion.y + 10, "(empty)", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#666677",
        })
        .setOrigin(0);
      this.invObjects.push(empty);
    }
  }
}
