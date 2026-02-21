import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import { recordSceneEntry } from "./saveHelpers";
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
  notifyOrderReady,
  defaultDurations,
} from "../domain/day-cycle";
import { enabledRecipesFor } from "../domain/menu";
import { findItem } from "../domain/items";
import {
  createInventory,
  addItem,
  removeItems,
  removeItemSet,
  hasIngredientsFor,
  itemCounts,
  removeExpired,
  type Inventory,
} from "../domain/inventory";
import {
  activateCuttingBoard,
  flipStove,
  assembleOrder,
  type KitchenServiceState,
} from "../domain/kitchen-service";
import {
  createKitchenZoneState,
  placeItemInZone,
  activateCuttingBoardSlot,
  flipStoveSlot,
  tickKitchenZones,
  type KitchenZoneState,
  type ZoneSlot,
} from "../domain/kitchen-zones";
import { timerBarVM } from "../domain/view/timer-vm";
import { kitchenServiceVM } from "../domain/view/kitchen-service-vm";
import type { OrderId, ItemId } from "../domain/branded";
import {
  timerBar,
  sceneTitleY,
  skipButtonPos,
  serviceOrdersRegion,
  serviceZoneRegion,
  servicePantryRegion,
  serviceReadyRegion,
  ZONE_PANEL_H,
  ZONE_PANEL_GAP,
} from "../domain/view/scene-layout";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const PANTRY_ROW_H = 38;
const PANTRY_ICON = 24;
const ORDER_ROW_H = 22;
const ORDER_COMPONENT_H = 16;
const SLOT_SPRITE_SIZE = 28;

// Colors
const COL_LABEL = "#f5a623";
const COL_IDLE = "#666677";
const COL_ACTIVE = "#4caf50";
const COL_FLIP = "#ff9800";
const COL_AUTO = "#2196f3";
const COL_HOLD = "#888899";
const COL_READY = "#8bc34a";
const COL_IN_ZONE = "#f5a623";
const COL_NEEDED = "#666677";
const COL_ASSEMBLE = "#4caf50";

export class KitchenScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;

  // Prep mode: scene-local zone state
  private prepZones: KitchenZoneState = createKitchenZoneState();

  // Shared renderable object lists
  private zoneObjects: Phaser.GameObjects.GameObject[] = [];
  private pantryObjects: Phaser.GameObjects.GameObject[] = [];
  private ordersObjects: Phaser.GameObjects.GameObject[] = [];
  private readyObjects: Phaser.GameObjects.GameObject[] = [];

  // State diffing
  private lastZoneKey = "";
  private lastPantryKey = "";
  private lastOrdersKey = "";

  // Cutting board hold state
  private cuttingBoardActive = false;

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
    this.prepZones = createKitchenZoneState();
    this.zoneObjects = [];
    this.pantryObjects = [];
    this.ordersObjects = [];
    this.readyObjects = [];
    this.lastZoneKey = "";
    this.lastPantryKey = "";
    this.lastOrdersKey = "";
    this.cuttingBoardActive = false;

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

      addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "Done Prepping \u25B6", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (current === undefined || current.phase.tag !== "kitchen_prep") return;
        const next = advanceToService(current, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      });

      this.renderZonePanels(this.prepZones);
      this.renderPantry();

    } else if (cycle.phase.tag === "service") {
      renderPixelText(this, ["THE KITCHEN"], { centerY: sceneTitleY });
      this.renderZonePanels(cycle.phase.kitchen.zones);
      this.renderPantry();
      this.renderOrdersList(cycle.phase.kitchen);

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

    if (updated.phase.tag === "kitchen_prep") {
      // Tick local zone state
      this.prepZones = tickKitchenZones(this.prepZones, delta);

      // Move all completed items from ready pile to inventory
      if (this.prepZones.ready.length > 0) {
        let updatedInv: Inventory = this.registry.get("inventory") ?? createInventory();
        this.prepZones.ready.forEach((id) => {
          updatedInv = addItem(updatedInv, id, now);
        });
        this.prepZones = { ...this.prepZones, ready: [] };
        this.registry.set("inventory", updatedInv);
        this.lastPantryKey = "";
      }

      this.updateZonePanels(this.prepZones);
      this.updatePantry();
    } else if (updated.phase.tag === "service") {
      this.updateZonePanels(updated.phase.kitchen.zones);
      this.updatePantry();
      this.updateOrdersList(updated.phase.kitchen);
    }

    if (isPhaseTimerExpired(updated)) {
      if (updated.phase.tag === "kitchen_prep") {
        const next = advanceToService(updated, defaultDurations.serviceMs);
        this.registry.set("dayCycle", next);
        this.scene.start("RestaurantScene");
      } else if (updated.phase.tag === "service") {
        const ended = advanceToDayEnd(updated);
        this.registry.set("dayCycle", ended);
        this.scene.start("RestaurantScene");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Zone panels
  // ---------------------------------------------------------------------------

  private zoneKey(zones: KitchenZoneState): string {
    const slotKey = (s: ZoneSlot): string => {
      if (s.tag === "empty") return "e";
      if (s.tag === "needs_flip") return `nf:${Math.floor(s.progressMs / s.durationMs * 20)}`;
      if (s.tag === "working") return `w:${s.interaction}:${s.isActive ? "1" : "0"}:${Math.floor(s.progressMs / s.durationMs * 20)}`;
      return "d";
    };
    return JSON.stringify({
      cb: zones.cuttingBoard.map(slotKey),
      st: zones.stove.map(slotKey),
      ov: zones.oven.map(slotKey),
      ready: zones.ready.join(","),
    });
  }

  private updateZonePanels(zones: KitchenZoneState): void {
    const key = this.zoneKey(zones);
    if (key === this.lastZoneKey) return;
    this.lastZoneKey = key;
    this.renderZonePanels(zones);
  }

  private renderZonePanels(zones: KitchenZoneState): void {
    this.zoneObjects.forEach((obj) => obj.destroy());
    this.zoneObjects = [];

    const zx = serviceZoneRegion.x;
    let zy = serviceZoneRegion.y;

    this.renderZonePanel("cuttingBoard", "CUTTING BOARD", zones.cuttingBoard, zx, zy, zones);
    zy += ZONE_PANEL_H + ZONE_PANEL_GAP;
    this.renderZonePanel("stove", "STOVE", zones.stove, zx, zy, zones);
    zy += ZONE_PANEL_H + ZONE_PANEL_GAP;
    this.renderZonePanel("oven", "OVEN", zones.oven, zx, zy, zones);
    zy += ZONE_PANEL_H + ZONE_PANEL_GAP;

    this.renderReadyPile(zones.ready, zx, zy);
  }

  private renderZonePanel(
    zone: "cuttingBoard" | "stove" | "oven",
    label: string,
    slots: ReadonlyArray<ZoneSlot>,
    px: number,
    py: number,
    allZones: KitchenZoneState,
  ): void {
    const panelW = serviceZoneRegion.width;
    const slotW = Math.floor(panelW / slots.length);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.85);
    bg.fillRoundedRect(px, py, panelW, ZONE_PANEL_H, 6);
    this.zoneObjects.push(bg);

    // Zone label
    this.zoneObjects.push(
      this.add.text(px + 6, py + 4, label, {
        fontFamily: "monospace",
        fontSize: "9px",
        color: COL_LABEL,
        fontStyle: "bold",
      })
    );

    slots.forEach((slot, i) => {
      const sx = px + i * slotW;
      const sy = py + 16;
      const sw = slotW - 4;
      const sh = ZONE_PANEL_H - 20;

      // Slot background
      const slotBg = this.add.graphics();
      slotBg.fillStyle(slot.tag === "empty" ? 0x0d0d1a : slot.tag === "needs_flip" ? 0x2e1a00 : 0x0d1a2e, 0.9);
      slotBg.fillRoundedRect(sx + 2, sy, sw, sh, 4);
      this.zoneObjects.push(slotBg);

      if (slot.tag === "empty") {
        this.zoneObjects.push(
          this.add.text(sx + sw / 2 + 2, sy + sh / 2, "empty", {
            fontFamily: "monospace",
            fontSize: "8px",
            color: "#333344",
          }).setOrigin(0.5, 0.5)
        );
        return;
      }

      // Sprite
      const spriteKey = `item-${slot.outputItemId}`;
      if (this.textures.exists(spriteKey)) {
        this.zoneObjects.push(
          this.add.image(sx + 8 + SLOT_SPRITE_SIZE / 2, sy + sh / 2 - 4, spriteKey)
            .setDisplaySize(SLOT_SPRITE_SIZE, SLOT_SPRITE_SIZE)
        );
      }

      // Item name
      const item = findItem(slot.outputItemId);
      const nameStr = item?.name ?? slot.outputItemId;
      this.zoneObjects.push(
        this.add.text(sx + 8 + SLOT_SPRITE_SIZE + 4, sy + 4, nameStr, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#ccccff",
          wordWrap: { width: sw - SLOT_SPRITE_SIZE - 16 },
        })
      );

      // Progress bar
      const barX = sx + 2;
      const barY = sy + sh - 10;
      const barW = sw;
      const barH = 7;
      const progress = slot.tag === "working"
        ? (slot.durationMs > 0 ? Math.min(1, slot.progressMs / slot.durationMs) : 0)
        : slot.tag === "needs_flip"
          ? (slot.durationMs > 0 ? Math.min(1, slot.progressMs / slot.durationMs) : 0)
          : 0;

      const gfx = this.add.graphics();
      gfx.fillStyle(0x222233, 1);
      gfx.fillRoundedRect(barX, barY, barW, barH, 3);
      const barColor = slot.tag === "needs_flip" ? 0xff9800
        : zone === "cuttingBoard" ? (slot.tag === "working" && slot.isActive ? 0x4caf50 : 0x555566)
        : zone === "stove" ? 0xff6b35
        : 0x2196f3;
      gfx.fillStyle(barColor, 1);
      gfx.fillRoundedRect(barX, barY, barW * progress, barH, 3);
      this.zoneObjects.push(gfx);

      // Interaction controls
      if (zone === "cuttingBoard" && slot.tag === "working") {
        this.renderHoldButton(slot, i, allZones, sx + 2, sy, sw, sh - 12);
      } else if (zone === "stove" && slot.tag === "needs_flip") {
        this.renderFlipButton(i, sx + 2, sy + 2, sw, 18);
      } else if (slot.tag === "needs_flip") {
        this.zoneObjects.push(
          this.add.text(sx + sw / 2 + 2, sy + 4, "FLIP NOW!", {
            fontFamily: "monospace",
            fontSize: "8px",
            color: COL_FLIP,
          }).setOrigin(0.5, 0)
        );
      }
    });
  }

  private renderHoldButton(
    _slot: ZoneSlot,
    slotIdx: number,
    _zones: KitchenZoneState,
    bx: number,
    by: number,
    bw: number,
    bh: number
  ): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    const isServiceMode = cycle?.phase.tag === "service";

    const hint = this.add.text(bx + bw / 2, by + 4, "HOLD", {
      fontFamily: "monospace",
      fontSize: "8px",
      color: this.cuttingBoardActive ? COL_ACTIVE : COL_HOLD,
    }).setOrigin(0.5, 0);
    this.zoneObjects.push(hint);

    const hitZone = this.add
      .zone(bx + bw / 2, by + bh / 2 + 8, bw, bh)
      .setInteractive({ useHandCursor: true });

    hitZone.on("pointerdown", () => {
      this.cuttingBoardActive = true;
      if (isServiceMode) {
        const cur: DayCycle | undefined = this.registry.get("dayCycle");
        if (!cur || cur.phase.tag !== "service") return;
        const newK = activateCuttingBoard(cur.phase.kitchen, slotIdx, true);
        this.registry.set("dayCycle", { ...cur, phase: { ...cur.phase, kitchen: newK } });
      } else {
        this.prepZones = activateCuttingBoardSlot(this.prepZones, slotIdx, true);
      }
      this.lastZoneKey = "";
    });

    const release = (): void => {
      if (!this.cuttingBoardActive) return;
      this.cuttingBoardActive = false;
      if (isServiceMode) {
        const cur: DayCycle | undefined = this.registry.get("dayCycle");
        if (!cur || cur.phase.tag !== "service") return;
        const newK = activateCuttingBoard(cur.phase.kitchen, slotIdx, false);
        this.registry.set("dayCycle", { ...cur, phase: { ...cur.phase, kitchen: newK } });
      } else {
        this.prepZones = activateCuttingBoardSlot(this.prepZones, slotIdx, false);
      }
      this.lastZoneKey = "";
    };
    hitZone.on("pointerup", release);
    hitZone.on("pointerout", release);
    this.zoneObjects.push(hitZone);
  }

  private renderFlipButton(slotIdx: number, bx: number, by: number, bw: number, bh: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    const isServiceMode = cycle?.phase.tag === "service";

    const btn = this.add.text(bx + bw / 2, by + bh / 2, "FLIP NOW!", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: COL_FLIP,
      backgroundColor: "#2e1a00",
      padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setColor("#ffcc66"));
    btn.on("pointerout", () => btn.setColor(COL_FLIP));
    btn.on("pointerdown", () => {
      if (isServiceMode) {
        const cur: DayCycle | undefined = this.registry.get("dayCycle");
        if (!cur || cur.phase.tag !== "service") return;
        const newK = flipStove(cur.phase.kitchen, slotIdx);
        this.registry.set("dayCycle", { ...cur, phase: { ...cur.phase, kitchen: newK } });
      } else {
        this.prepZones = flipStoveSlot(this.prepZones, slotIdx);
      }
      this.lastZoneKey = "";
    });
    this.zoneObjects.push(btn);
  }

  private renderReadyPile(ready: ReadonlyArray<ItemId>, rx: number, ry: number): void {
    this.readyObjects.forEach((obj) => obj.destroy());
    this.readyObjects = [];

    if (ready.length === 0) return;

    const bg = this.add.graphics();
    bg.fillStyle(0x1a2e1a, 0.8);
    bg.fillRoundedRect(rx, ry, serviceZoneRegion.width, 50, 6);
    this.readyObjects.push(bg);

    this.readyObjects.push(
      this.add.text(rx + 6, ry + 4, "READY:", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: COL_READY,
        fontStyle: "bold",
      })
    );

    // Group by itemId
    const counts = new Map<ItemId, number>();
    ready.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));

    let x = rx + 50;
    counts.forEach((count, id) => {
      const spriteKey = `item-${id}`;
      if (this.textures.exists(spriteKey)) {
        this.readyObjects.push(
          this.add.image(x + 10, ry + 16, spriteKey).setDisplaySize(20, 20)
        );
        x += 24;
      }
      const item = findItem(id);
      const name = item?.name ?? id;
      const label = count > 1 ? `${name}x${count}` : name;
      this.readyObjects.push(
        this.add.text(x, ry + 16, label, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: COL_READY,
        }).setOrigin(0, 0.5)
      );
      x += label.length * 5 + 10;
    });
  }

  // ---------------------------------------------------------------------------
  // Pantry (right strip)
  // ---------------------------------------------------------------------------

  private pantryKey(inv: Inventory): string {
    return inv.items.map((i) => i.itemId).sort().join(",");
  }

  private updatePantry(): void {
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const key = this.pantryKey(inv);
    if (key === this.lastPantryKey) return;
    this.lastPantryKey = key;
    this.renderPantry();
  }

  private renderPantry(): void {
    this.pantryObjects.forEach((obj) => obj.destroy());
    this.pantryObjects = [];

    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const type = getActiveRestaurantType(this.registry);
    const unlocked = getActiveUnlockedCount(this.registry);
    const disabled = getActiveDisabledDishes(this.registry);
    const recipes = enabledRecipesFor(type, unlocked, disabled);

    // Filter to prep/cook steps with zone assignments, where inputs are in inventory
    const availableSteps = recipes.filter(
      (r) => r.zone !== undefined && r.method !== "assemble" && hasIngredientsFor(inv, r)
    );

    const px = servicePantryRegion.x;
    let py = servicePantryRegion.y;

    this.pantryObjects.push(
      this.add.text(px, py, "PANTRY", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: COL_LABEL,
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 4, y: 2 },
      })
    );
    py += 20;

    if (availableSteps.length === 0) {
      this.pantryObjects.push(
        this.add.text(px + 4, py + 10, "(nothing to prep)", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: COL_IDLE,
        })
      );
      return;
    }

    const isServiceMode = cycle.phase.tag === "service";

    availableSteps.forEach((recipe) => {
      const zone = recipe.zone!;
      const interaction = recipe.interaction!;
      const rowW = servicePantryRegion.width - 4;

      // Row background
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x1a1a2e, 0.8);
      rowBg.fillRoundedRect(px, py, rowW, PANTRY_ROW_H - 4, 4);
      this.pantryObjects.push(rowBg);

      // Zone badge color
      const zoneColor = zone === "cuttingBoard" ? "#888899" : zone === "stove" ? "#ff6b35" : "#2196f3";
      const zoneLbl = zone === "cuttingBoard" ? "CB" : zone === "stove" ? "ST" : "OV";

      // Output sprite
      const spriteKey = `item-${recipe.output}`;
      if (this.textures.exists(spriteKey)) {
        this.pantryObjects.push(
          this.add.image(px + PANTRY_ICON / 2 + 2, py + PANTRY_ROW_H / 2 - 4, spriteKey)
            .setDisplaySize(PANTRY_ICON, PANTRY_ICON)
        );
      }

      // Output name
      const outputItem = findItem(recipe.output);
      const outputName = outputItem?.name ?? recipe.output;
      const shortName = outputName.length > 14 ? outputName.slice(0, 13) + "." : outputName;
      this.pantryObjects.push(
        this.add.text(px + PANTRY_ICON + 6, py + 4, shortName, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#ccccff",
        })
      );

      // Zone badge + time
      this.pantryObjects.push(
        this.add.text(px + PANTRY_ICON + 6, py + 18, `[${zoneLbl}] ${(recipe.timeMs / 1000).toFixed(0)}s`, {
          fontFamily: "monospace",
          fontSize: "8px",
          color: zoneColor,
        })
      );

      // Interaction hint
      const interHint = interaction === "hold" ? "hold" : interaction === "flip" ? "flip" : "auto";
      this.pantryObjects.push(
        this.add.text(px + rowW - 4, py + 4, interHint, {
          fontFamily: "monospace",
          fontSize: "7px",
          color: zoneColor,
        }).setOrigin(1, 0)
      );

      // Clickable zone
      const hitZone = this.add
        .zone(px + rowW / 2, py + (PANTRY_ROW_H - 4) / 2, rowW, PANTRY_ROW_H - 4)
        .setInteractive({ useHandCursor: true });

      hitZone.on("pointerover", () => {
        rowBg.clear();
        rowBg.fillStyle(0x2a2a4e, 0.95);
        rowBg.fillRoundedRect(px, py, rowW, PANTRY_ROW_H - 4, 4);
      });
      hitZone.on("pointerout", () => {
        rowBg.clear();
        rowBg.fillStyle(0x1a1a2e, 0.8);
        rowBg.fillRoundedRect(px, py, rowW, PANTRY_ROW_H - 4, 4);
      });
      hitZone.on("pointerdown", () => {
        this.handlePantryTap(recipe, zone, isServiceMode);
      });
      this.pantryObjects.push(hitZone);

      py += PANTRY_ROW_H;
    });
  }

  private handlePantryTap(
    recipe: import("../domain/recipes").RecipeStep,
    zone: import("../domain/kitchen-zones").KitchenZone,
    isServiceMode: boolean
  ): void {
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();

    if (isServiceMode) {
      const cycle: DayCycle | undefined = this.registry.get("dayCycle");
      if (!cycle || cycle.phase.tag !== "service") return;
      // Consume all inputs (multi-input recipes like sushi-rice)
      const newInv = removeItemSet(inv, recipe.inputs);
      if (newInv === undefined) return;
      const newZones = placeItemInZone(cycle.phase.kitchen.zones, zone, recipe.output, recipe.timeMs, recipe.interaction!);
      if (newZones === undefined) return;
      this.registry.set("dayCycle", { ...cycle, phase: { ...cycle.phase, kitchen: { ...cycle.phase.kitchen, zones: newZones } } });
      this.registry.set("inventory", newInv);
    } else {
      // Prep mode: consume all inputs, place in local prepZones
      const newInv = removeItemSet(inv, recipe.inputs);
      if (newInv === undefined) return;
      const newZones = placeItemInZone(this.prepZones, zone, recipe.output, recipe.timeMs, recipe.interaction!);
      if (newZones === undefined) return;
      this.prepZones = newZones;
      this.registry.set("inventory", newInv);
    }

    this.lastZoneKey = "";
    this.lastPantryKey = "";
  }

  // ---------------------------------------------------------------------------
  // Orders list (service mode only, left strip)
  // ---------------------------------------------------------------------------

  private ordersKey(kitchen: KitchenServiceState, inv: Inventory): string {
    const inv_key = inv.items.map((i) => i.itemId).sort().join(",");
    return JSON.stringify({
      pending: kitchen.pendingOrders.map((o) => o.id),
      ready: kitchen.zones.ready.join(","),
      orderUp: kitchen.orderUp.map((o) => o.id),
      inv: inv_key,
    });
  }

  private updateOrdersList(kitchen: KitchenServiceState): void {
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const key = this.ordersKey(kitchen, inv);
    if (key === this.lastOrdersKey) return;
    this.lastOrdersKey = key;
    this.renderOrdersList(kitchen);
  }

  private renderOrdersList(kitchen: KitchenServiceState): void {
    this.ordersObjects.forEach((obj) => obj.destroy());
    this.ordersObjects = [];

    const inv: Inventory = this.registry.get("inventory") ?? createInventory();
    const vm = kitchenServiceVM(kitchen, inv);

    const ox = serviceOrdersRegion.x;
    let oy = serviceOrdersRegion.y;

    this.ordersObjects.push(
      this.add.text(ox, oy, "ORDERS", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: COL_LABEL,
        fontStyle: "bold",
        backgroundColor: "#1a1a2e",
        padding: { x: 4, y: 2 },
      })
    );
    oy += 20;

    if (vm.pendingOrders.length === 0) {
      this.ordersObjects.push(
        this.add.text(ox + 4, oy, "(none)", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: COL_IDLE,
        })
      );
    }

    vm.pendingOrders.forEach((order) => {
      // Dish sprite + name
      const spriteKey = order.dishSpriteKey;
      if (this.textures.exists(spriteKey)) {
        this.ordersObjects.push(
          this.add.image(ox + 10, oy + 8, spriteKey).setDisplaySize(16, 16)
        );
      }

      const shortDish = order.dishName.length > 13 ? order.dishName.slice(0, 12) + "." : order.dishName;
      this.ordersObjects.push(
        this.add.text(ox + 22, oy + 2, shortDish, {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#ccccff",
          fontStyle: "bold",
        })
      );
      oy += ORDER_ROW_H;

      // Components
      order.components.forEach((comp) => {
        const statusColor = comp.status === "ready" ? COL_READY
          : comp.status === "in_zone" ? COL_IN_ZONE
          : COL_NEEDED;
        const statusIcon = comp.status === "ready" ? "✓ " : comp.status === "in_zone" ? "… " : "○ ";
        const shortComp = comp.name.length > 12 ? comp.name.slice(0, 11) + "." : comp.name;
        this.ordersObjects.push(
          this.add.text(ox + 4, oy, `${statusIcon}${shortComp}`, {
            fontFamily: "monospace",
            fontSize: "7px",
            color: statusColor,
          })
        );
        oy += ORDER_COMPONENT_H;
      });

      // ASSEMBLE button
      if (order.isAssemblable) {
        const oid = order.orderId;
        const btn = this.add.text(ox + serviceOrdersRegion.width / 2, oy, "ASSEMBLE", {
          fontFamily: "monospace",
          fontSize: "9px",
          color: COL_ASSEMBLE,
          backgroundColor: "#1a2e1a",
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5, 0)
          .setInteractive({ useHandCursor: true });

        btn.on("pointerover", () => btn.setColor("#aaffaa"));
        btn.on("pointerout", () => btn.setColor(COL_ASSEMBLE));
        btn.on("pointerdown", () => this.handleAssemble(oid));
        this.ordersObjects.push(btn);
        oy += 22;
      }

      oy += 6; // gap between orders
    });

    // Order up list
    if (vm.orderUp.length > 0) {
      this.ordersObjects.push(
        this.add.text(ox, oy + 4, "ORDER UP:", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: COL_READY,
          fontStyle: "bold",
        })
      );
      oy += 18;
      vm.orderUp.forEach((o) => {
        const shortName = o.dishName.length > 13 ? o.dishName.slice(0, 12) + "." : o.dishName;
        this.ordersObjects.push(
          this.add.text(ox + 4, oy, `✓ ${shortName}`, {
            fontFamily: "monospace",
            fontSize: "8px",
            color: COL_READY,
          })
        );
        oy += 14;
      });
    }
  }

  private handleAssemble(oid: OrderId): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (!cycle || cycle.phase.tag !== "service") return;
    const inv: Inventory = this.registry.get("inventory") ?? createInventory();

    const result = assembleOrder(cycle.phase.kitchen, inv, oid);
    if (result === undefined) return;

    // Notify the table that the order is ready
    const updatedPhase = notifyOrderReady(
      { ...cycle.phase, kitchen: result.kitchen },
      oid
    );
    this.registry.set("dayCycle", { ...cycle, phase: updatedPhase });
    this.registry.set("inventory", result.inventory);
    this.lastZoneKey = "";
    this.lastOrdersKey = "";
  }
}
