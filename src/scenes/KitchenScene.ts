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
  finishCooking,
  abandonOrder,
  activeCustomerId,
  defaultDurations,
} from "../domain/day-cycle";
import { unseatCustomer } from "../domain/tables";
import { enabledRecipesFor } from "../domain/menu";
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
import { timerBarVM } from "../domain/view/timer-vm";
import {
  kitchenVM,
  type ActiveRecipe,
  type RecipeVM,
} from "../domain/view/kitchen-vm";
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

  constructor() {
    super("KitchenScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "kitchen");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "kitchen"));
    }

    // Preload item sprites for enabled recipes
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
    // Reset cooking state from any previous scene invocation
    this.cookingTimer?.destroy();
    this.cookingTimer = undefined;
    this.activeRecipe = undefined;
    this.recipeStartTime = 0;
    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;

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

      // Skip-ahead button
      addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "Done Prepping \u25B6", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (current === undefined || current.phase.tag !== "kitchen_prep") return;
        this.cookingTimer?.destroy();
        const next = advanceToService(current, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      });
    } else if (
      cycle.phase.tag === "service" &&
      cycle.phase.subPhase.tag === "cooking"
    ) {
      renderPixelText(this, ["THE KITCHEN"], { centerY: sceneTitleY });
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

    // Update inline cooking progress on active recipe row
    if (this.activeRecipe !== undefined && this.activeRowFill) {
      const elapsed = Date.now() - this.recipeStartTime;
      const fraction = Math.min(1, elapsed / this.activeRecipe.timeMs);
      this.activeRowFill.width = recipeRegion.width * fraction;
      const remaining = Math.max(0, this.activeRecipe.timeMs - elapsed);
      this.activeRowTimeText?.setText(`${(remaining / 1000).toFixed(1)}s`);
    }

    // Redraw timer bar using view model
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
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabledDishes = getActiveDisabledDishes(this.registry);
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();

    const activeRecipeState: ActiveRecipe | undefined =
      this.activeRecipe !== undefined
        ? { step: this.activeRecipe, startedAt: this.recipeStartTime }
        : undefined;

    const vm = kitchenVM(inv, type, unlockedCount, activeRecipeState, Date.now(), disabledDishes);
    const isBusy = this.activeRecipe !== undefined;

    // Sort: craftable first, limit to 7
    const sortedRecipes = [...vm.recipes].sort((a, b) => {
      const aCanMake = a.canMake ? 0 : 1;
      const bCanMake = b.canMake ? 0 : 1;
      return aCanMake - bCanMake;
    });
    const maxVisible = 7;
    const visibleRecipes = sortedRecipes.slice(0, maxVisible);

    // Reset inline progress references (containers are destroyed above)
    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;

    const positions = recipeStack(visibleRecipes.length);
    const rowWidth = recipeRegion.width;

    visibleRecipes.forEach((recipe, i) => {
      const pos = positions[i];
      const container = this.add.container(pos.x, pos.y);
      const isActiveRow = recipe.stepId === this.activeRecipe?.id;

      // Background
      const bgColor = isActiveRow ? 0x1a1a3e : recipe.canMake ? 0x1a2e1a : 0x1a1a2e;
      const bgAlpha = isActiveRow ? 0.85 : recipe.canMake && !isBusy ? 0.85 : 0.5;
      const bg = this.add.graphics();
      bg.fillStyle(bgColor, bgAlpha);
      bg.fillRoundedRect(0, -RECIPE_ROW_H / 2 + 2, rowWidth, RECIPE_ROW_H - 4, 4);
      container.add(bg);

      // Fill overlay for active (cooking) row
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

      // Output item icon
      if (this.textures.exists(recipe.outputSpriteKey)) {
        const sprite = this.add
          .image(22, 0, recipe.outputSpriteKey)
          .setDisplaySize(RECIPE_ICON_SIZE, RECIPE_ICON_SIZE);
        container.add(sprite);
      }

      // Recipe name
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

      // Input requirements (from VM)
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

      // Time label -- countdown for active row, static for others
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

      // Make clickable -- need to find the original RecipeStep for startRecipe
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

      this.recipeButtons.push(container);
    });
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
    this.activeRowFill = undefined;
    this.activeRowTimeText = undefined;

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

  private renderInventory(): void {
    this.invObjects.forEach((obj) => obj.destroy());
    this.invObjects = [];

    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const counts = itemCounts(inv);

    // Title
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

    // Item list
    counts.forEach((entry, i) => {
      const col = Math.floor(i / 12);
      const row = i % 12;
      const x = kitchenInvRegion.x + col * KITCHEN_INV_COL_W * 2;
      const y = kitchenInvRegion.y + 10 + row * KITCHEN_INV_ROW_H;

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
        .text(kitchenInvRegion.x, kitchenInvRegion.y + 10, "(empty)", {
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

    // Show order subtitle between title and recipe list
    const spriteKey = `item-${dishId}`;
    const orderY = recipeRegion.y - 8;
    if (this.textures.exists(spriteKey)) {
      this.add
        .image(recipeRegion.x + 10, orderY, spriteKey)
        .setDisplaySize(20, 20);
    }
    this.add
      .text(recipeRegion.x + 26, orderY, `Order: ${dishName}`, {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#f5a623",
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0, 0.5);

    // Abandon order button
    addMenuButton(
      this,
      skipButtonPos.x,
      skipButtonPos.y,
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
