import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import { recordSceneEntry } from "./saveHelpers";
import { showTutorialHint } from "./tutorialHint";
import { renderTimerBar, formatTimeRemaining } from "./timerBar";
import { renderPanel } from "./panel";
import {
  getActiveRestaurantType,
  backgroundKey,
  backgroundAssetPath,
} from "./restaurantTypeHelper";
import {
  type DayCycle,
  tickTimer,
  isPhaseTimerExpired,
  isTimedPhase,
  timerFraction,
  advanceToService,
  advanceToDayEnd,
  finishCooking,
  abandonOrder,
  activeCustomerId,
  defaultDurations,
} from "../domain/day-cycle";
import { unseatCustomer } from "../domain/tables";
import { availableRecipesFor } from "../domain/menu";
import { findItem } from "../domain/items";
import type { RecipeStep } from "../domain/recipes";
import {
  createInventory,
  countItem,
  hasIngredientsFor,
  removeItemSet,
  removeExpired,
  itemCounts,
  type Inventory,
} from "../domain/inventory";

// Layout constants
const RECIPE_LIST_LEFT = 50;
const RECIPE_LIST_TOP = 140;
const RECIPE_ROW_H = 56;
const RECIPE_COLS = 1;
const RECIPE_WIDTH = 340;
const INV_LEFT = 430;
const INV_TOP = 140;
const INV_COL_W = 90;
const INV_ROW_H = 30;
const ICON_SIZE = 36;

export class KitchenScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private cookingTimer?: Phaser.Time.TimerEvent;
  private recipeButtons: Phaser.GameObjects.Container[] = [];
  private invObjects: Phaser.GameObjects.GameObject[] = [];
  private activeRecipe?: RecipeStep;
  private progressBar?: Phaser.GameObjects.Graphics;
  private progressLabel?: Phaser.GameObjects.Text;
  private recipeStartTime = 0;

  constructor() {
    super("KitchenScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "kitchen");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "kitchen"));
    }

    // Preload item sprites for recipes
    const recipes = availableRecipesFor(type);
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
      renderPixelText(this, ["THE KITCHEN"], { centerY: 110 });
      this.renderRecipeList();
      this.renderInventory();
      showTutorialHint(this, "kitchen_prep");
    } else if (
      cycle.phase.tag === "service" &&
      cycle.phase.subPhase.tag === "cooking"
    ) {
      renderPixelText(this, ["THE KITCHEN"], { centerY: 110 });
      this.renderServiceCooking();
    }

    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.pause();
      this.scene.launch("PauseScene", { callerScene: "KitchenScene" });
    });
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    // Only tick for phases with timers
    if (cycle.phase.tag === "day_end") return;

    const updated = tickTimer(cycle, delta);
    this.registry.set("dayCycle", updated);
    if (!isTimedPhase(updated.phase)) return;

    // Expire inventory items past their shelf life
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const now = Date.now();
    const afterExpiry = removeExpired(inv, now);
    if (afterExpiry.items.length < inv.items.length) {
      this.registry.set("inventory", afterExpiry);
      this.renderRecipeList();
      this.renderInventory();
    }

    // Update recipe progress bar if cooking, clean up if done
    if (this.activeRecipe !== undefined) {
      const elapsed = Date.now() - this.recipeStartTime;
      const fraction = Math.min(1, elapsed / this.activeRecipe.timeMs);
      this.updateProgressBar(fraction, this.activeRecipe);
    } else {
      this.progressBar?.destroy();
      this.progressLabel?.destroy();
      this.progressBar = undefined;
      this.progressLabel = undefined;
    }

    // Determine label based on current mode
    const label =
      updated.phase.tag === "kitchen_prep"
        ? `DAY ${updated.day} - PREPPING ${formatTimeRemaining(updated.phase.remainingMs)}`
        : `DAY ${updated.day} - SERVICE ${formatTimeRemaining(updated.phase.remainingMs)}`;

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const fraction = timerFraction(updated.phase);
    this.timerGraphics = renderTimerBar(this, 100, 50, 600, 24, fraction, {
      label,
    });
    this.timerLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;

    if (isPhaseTimerExpired(updated)) {
      if (updated.phase.tag === "kitchen_prep") {
        const next = advanceToService(updated, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      } else if (updated.phase.tag === "service") {
        // Service timer expired while cooking
        this.cookingTimer?.destroy();
        const ended = advanceToDayEnd(updated);
        this.registry.set("dayCycle", ended);
        this.scene.start("RestaurantScene");
      }
    }
  }

  private renderRecipeList(): void {
    this.recipeButtons.forEach((c) => c.destroy());
    this.recipeButtons = [];

    const type = getActiveRestaurantType(this.registry);
    const recipes = availableRecipesFor(type);
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();

    // Show all recipes (prep, cook, and assemble) in both kitchen prep and service cooking
    const filteredRecipes = recipes;

    // Show up to 7 recipes, prioritizing craftable ones
    const sortedRecipes = [...filteredRecipes].sort((a, b) => {
      const aCanMake = hasIngredientsFor(inv, a) ? 0 : 1;
      const bCanMake = hasIngredientsFor(inv, b) ? 0 : 1;
      return aCanMake - bCanMake;
    });
    const maxVisible = 7;
    const visibleRecipes = sortedRecipes.slice(0, maxVisible);

    visibleRecipes.forEach((recipe, i) => {
      const y = RECIPE_LIST_TOP + i * RECIPE_ROW_H + RECIPE_ROW_H / 2;
      const canMake = hasIngredientsFor(inv, recipe);
      const isBusy = this.activeRecipe !== undefined;

      const container = this.add.container(RECIPE_LIST_LEFT, y);

      // Background
      const bg = this.add.graphics();
      const bgAlpha = canMake && !isBusy ? 0.85 : 0.5;
      bg.fillStyle(canMake ? 0x1a2e1a : 0x1a1a2e, bgAlpha);
      bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, RECIPE_WIDTH, RECIPE_ROW_H - 4, 4);
      container.add(bg);

      // Output item icon
      const spriteKey = `item-${recipe.output}`;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add
          .image(22, 0, spriteKey)
          .setDisplaySize(ICON_SIZE, ICON_SIZE);
        container.add(sprite);
      }

      // Recipe name
      const outputItem = findItem(recipe.output);
      const name = outputItem?.name ?? recipe.name;
      const nameText = this.add
        .text(46, -10, name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: canMake ? "#4caf50" : "#666677",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      container.add(nameText);

      // Input requirements
      const inputsStr = recipe.inputs
        .map((inp) => {
          const item = findItem(inp.itemId);
          const have = countItem(inv, inp.itemId);
          const short = have < inp.quantity;
          const name = item?.name ?? inp.itemId;
          return `${short ? "!" : ""}${name}(${have}/${inp.quantity})`;
        })
        .join(" ");
      const inputsText = this.add
        .text(46, 8, inputsStr, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#888899",
        })
        .setOrigin(0, 0.5);
      container.add(inputsText);

      // Time label
      const timeStr = `${(recipe.timeMs / 1000).toFixed(0)}s`;
      const timeText = this.add
        .text(RECIPE_WIDTH - 10, 0, timeStr, {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#f5a623",
        })
        .setOrigin(1, 0.5);
      container.add(timeText);

      // Make clickable
      if (canMake && !isBusy) {
        const hitZone = this.add
          .zone(RECIPE_WIDTH / 2, 0, RECIPE_WIDTH, RECIPE_ROW_H - 4)
          .setInteractive({ useHandCursor: true });
        container.add(hitZone);

        hitZone.on("pointerover", () => {
          bg.clear();
          bg.fillStyle(0x2a4e2a, 0.95);
          bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, RECIPE_WIDTH, RECIPE_ROW_H - 4, 4);
        });
        hitZone.on("pointerout", () => {
          bg.clear();
          bg.fillStyle(0x1a2e1a, bgAlpha);
          bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, RECIPE_WIDTH, RECIPE_ROW_H - 4, 4);
        });
        hitZone.on("pointerdown", () => {
          this.startRecipe(recipe);
        });
      }

      this.recipeButtons.push(container);
    });
  }

  private startRecipe(recipe: RecipeStep): void {
    if (this.activeRecipe !== undefined) return; // already cooking

    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    if (!hasIngredientsFor(inv, recipe)) return;

    // Consume inputs using domain function
    const afterConsume = removeItemSet(inv, recipe.inputs);
    if (afterConsume === undefined) return;

    this.activeRecipe = recipe;
    this.recipeStartTime = Date.now();
    this.registry.set("inventory", afterConsume);

    // Refresh display
    this.renderRecipeList();
    this.renderInventory();

    // Set timer for recipe completion (instant if timeMs is 0, e.g. assemble)
    if (recipe.timeMs <= 0) {
      this.finishRecipe(recipe);
    } else {
      this.cookingTimer = this.time.delayedCall(recipe.timeMs, () => {
        this.finishRecipe(recipe);
      });
    }
  }

  private finishRecipe(recipe: RecipeStep): void {
    // Add output to inventory
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const updated: Inventory = {
      items: [...inv.items, { itemId: recipe.output, createdAt: Date.now() }],
    };
    this.registry.set("inventory", updated);

    this.activeRecipe = undefined;
    this.progressBar?.destroy();
    this.progressLabel?.destroy();
    this.progressBar = undefined;
    this.progressLabel = undefined;

    // Check if we just completed a service cooking order
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (
      cycle !== undefined &&
      cycle.phase.tag === "service" &&
      cycle.phase.subPhase.tag === "cooking"
    ) {
      const dishId = cycle.phase.subPhase.order.dishId;
      if (countItem(updated, dishId) > 0) {
        // We have the dish! Finish cooking and go back to restaurant
        this.finishServiceCooking();
        return;
      }
    }

    // Refresh display
    this.renderRecipeList();
    this.renderInventory();
  }

  private updateProgressBar(fraction: number, recipe: RecipeStep): void {
    this.progressBar?.destroy();
    this.progressLabel?.destroy();

    const y = this.scale.height - 70;
    const outputItem = findItem(recipe.output);
    const name = outputItem?.name ?? recipe.name;
    const remaining = Math.max(
      0,
      recipe.timeMs - (Date.now() - this.recipeStartTime)
    );
    const label = `${name} ${(remaining / 1000).toFixed(1)}s`;

    this.progressBar = renderTimerBar(this, 100, y, 600, 20, fraction, {
      color: 0x2196f3,
      label,
    });
    this.progressLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;
  }

  private renderInventory(): void {
    this.invObjects.forEach((obj) => obj.destroy());
    this.invObjects = [];

    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const counts = itemCounts(inv);

    // Title
    const title = this.add
      .text(INV_LEFT, INV_TOP - 20, "INVENTORY", {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#f5a623",
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0);
    this.invObjects.push(title);

    // Item list
    counts.forEach((entry, i) => {
      const col = Math.floor(i / 12);
      const row = i % 12;
      const x = INV_LEFT + col * INV_COL_W * 2;
      const y = INV_TOP + 10 + row * INV_ROW_H;

      const item = findItem(entry.itemId);
      const name = item?.name ?? entry.itemId;
      const shortName = name.length > 14 ? name.slice(0, 13) + "." : name;

      // Item icon (small)
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
        .text(INV_LEFT, INV_TOP + 10, "(empty)", {
          fontFamily: "monospace",
          fontSize: "10px",
          color: "#666677",
        })
        .setOrigin(0);
      this.invObjects.push(empty);
    }
  }

  private renderServiceCooking(): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (
      cycle === undefined ||
      cycle.phase.tag !== "service" ||
      cycle.phase.subPhase.tag !== "cooking"
    )
      return;

    const dishId = cycle.phase.subPhase.order.dishId;
    const dishItem = findItem(dishId);
    const dishName = dishItem?.name ?? dishId;

    // Check if we have the dish in inventory already
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const hasDish = countItem(inv, dishId) > 0;

    if (hasDish) {
      // We have the dish! Finish cooking immediately
      this.finishServiceCooking();
      return;
    }

    // Show what we need to cook
    this.add
      .text(this.scale.width / 2, 140, `Order: ${dishName}`, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f5a623",
        backgroundColor: "#1a1a2e",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5);

    // Show dish sprite
    const spriteKey = `item-${dishId}`;
    if (this.textures.exists(spriteKey)) {
      this.add
        .image(this.scale.width / 2, 180, spriteKey)
        .setDisplaySize(48, 48);
    }

    // Abandon order button
    addMenuButton(
      this,
      this.scale.width - 100,
      this.scale.height - 40,
      "Abandon Order",
      () => this.abandonServiceCooking()
    );

    // Show recipe steps for this dish (same as prep mode but filtered)
    this.renderRecipeList();
    this.renderInventory();
  }

  private abandonServiceCooking(): void {
    const current: DayCycle | undefined = this.registry.get("dayCycle");
    if (
      current === undefined ||
      current.phase.tag !== "service" ||
      current.phase.subPhase.tag !== "cooking"
    )
      return;

    this.cookingTimer?.destroy();
    const custId = activeCustomerId(current.phase);
    const abandoned = abandonOrder(current.phase);
    const updatedLayout =
      custId !== undefined
        ? unseatCustomer(abandoned.tableLayout, custId)
        : abandoned.tableLayout;
    const updated: DayCycle = {
      ...current,
      phase: { ...abandoned, tableLayout: updatedLayout },
    };
    this.registry.set("dayCycle", updated);
    this.scene.start("RestaurantScene");
  }

  private finishServiceCooking(): void {
    const current: DayCycle | undefined = this.registry.get("dayCycle");
    if (
      current === undefined ||
      current.phase.tag !== "service" ||
      current.phase.subPhase.tag !== "cooking"
    )
      return;

    const cooked = finishCooking(current.phase);
    const updated: DayCycle = { ...current, phase: cooked };
    this.registry.set("dayCycle", updated);
    this.scene.start("RestaurantScene");
  }
}
