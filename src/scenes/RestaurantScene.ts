import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import { initialWallet, formatCoins, addCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";
import { recordSceneEntry } from "./saveHelpers";
import { showTutorialHint } from "./tutorialHint";
import { renderTimerBar, formatTimeRemaining } from "./timerBar";
import { renderPanel } from "./panel";
import {
  getActiveRestaurantType,
  backgroundKey,
  backgroundAssetPath,
  tableKey,
  tableAssetPath,
} from "./restaurantTypeHelper";
import {
  type DayCycle,
  type ServicePhase,
  createCustomer,
  tickTimer,
  isPhaseTimerExpired,
  timerFraction,
  advanceToDayEnd,
  advanceToNextDay,
  enqueueCustomer,
  beginTakingOrder,
  beginCooking,
  finishCooking,
  finishServing,
  abandonOrder,
  activeCustomerId,
  tickCustomerPatience,
  removeExpiredCustomers,
  defaultDurations,
} from "../domain/day-cycle";
import { pickRandomDish, menuFor } from "../domain/menu";
import { findItem } from "../domain/items";
import {
  createInventory,
  countItem,
  removeItems,
  removeExpired,
  itemCounts,
  itemFreshness,
  type Inventory,
} from "../domain/inventory";
import {
  emptyTableIds,
  seatCustomer,
  unseatCustomer,
} from "../domain/tables";
import { difficultyForDay } from "../domain/difficulty";
import {
  type Leaderboard,
  createLeaderboard,
  recordDayResult,
} from "../domain/leaderboard";

const TABLE_SIZE = 140;
const TABLE_POSITIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 180, y: 290 }, { x: 400, y: 290 }, { x: 620, y: 290 },
  { x: 180, y: 460 }, { x: 400, y: 460 }, { x: 620, y: 460 },
];
const BUBBLE_OFFSET_Y = -60; // above table center
const PATIENCE_BAR_W = 50;
const PATIENCE_BAR_H = 5;

const patienceColor = (fraction: number): number =>
  fraction > 0.5 ? 0x66ff66 : fraction > 0.25 ? 0xffff66 : 0xff6666;

export class RestaurantScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private customerSpawnTimer?: Phaser.Time.TimerEvent;
  private statusObjects: Phaser.GameObjects.GameObject[] = [];
  private inventoryObjects: Phaser.GameObjects.GameObject[] = [];
  private bubbleObjects: Phaser.GameObjects.GameObject[] = [];
  private dayEndShown = false;
  private tableSprites: Phaser.GameObjects.Image[] = [];
  private customersSpawned = 0;
  private notificationObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("RestaurantScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const bgKey = backgroundKey(type, "restaurant");
    if (!this.textures.exists(bgKey)) {
      this.load.image(bgKey, backgroundAssetPath(type, "restaurant"));
    }
    const tKey = tableKey(type);
    if (!this.textures.exists(tKey)) {
      this.load.image(tKey, tableAssetPath(type));
    }
    // Preload dish sprites for this restaurant type
    const menu = menuFor(type);
    menu.items.forEach((mi) => {
      const spriteKey = `item-${mi.dishId}`;
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, `assets/items/${mi.dishId}.png`);
      }
    });
  }

  create(): void {
    this.dayEndShown = false;
    this.statusObjects = [];
    this.tableSprites = [];
    recordSceneEntry(this.registry, "RestaurantScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "restaurant"))
      .setDisplaySize(w, h);

    // Place table sprites
    const tKey = tableKey(type);
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    const numTables =
      cycle !== undefined && cycle.phase.tag === "service"
        ? cycle.phase.tableLayout.tables.length
        : 4;

    TABLE_POSITIONS.slice(0, numTables).forEach((pos) => {
      const sprite = this.add.image(pos.x, pos.y, tKey).setDisplaySize(TABLE_SIZE, TABLE_SIZE);
      this.tableSprites.push(sprite);
    });

    renderPanel(this, { marginTop: 80, marginBottom: 40, marginLeft: 40, marginRight: 40 }, { fillAlpha: 0.35 });

    renderPixelText(this, ["RESTAURANT"], { centerY: 120 });

    this.renderCoinHud();

    this.input.keyboard!.on("keydown-ESC", () => {
      this.scene.pause();
      this.scene.launch("PauseScene", { callerScene: "RestaurantScene" });
    });

    if (cycle === undefined) return;

    if (cycle.phase.tag === "day_end") {
      this.showDayEnd(cycle);
      return;
    }

    if (cycle.phase.tag !== "service") return;

    this.updateTableTints(cycle.phase);
    this.customersSpawned = 0;

    // Use day-based difficulty for spawn timing
    const difficulty = difficultyForDay(cycle.day);
    const spawnDelay =
      difficulty.customerSpawnMinMs +
      Math.random() *
        (difficulty.customerSpawnMaxMs - difficulty.customerSpawnMinMs);

    this.customerSpawnTimer = this.time.addEvent({
      delay: spawnDelay,
      callback: () => this.spawnCustomer(),
      loop: true,
    });

    // Spawn first customer quickly
    this.time.delayedCall(2_000, () => this.spawnCustomer());

    showTutorialHint(this, "service");
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;
    if (cycle.phase.tag === "day_end") return;
    if (cycle.phase.tag !== "service") return;

    const ticked = tickTimer(cycle, delta);
    if (ticked.phase.tag !== "service") return;

    // Tick customer patience and remove expired customers
    const withPatience = tickCustomerPatience(ticked.phase, delta);
    const beforeCount = withPatience.customerQueue.length;
    const servicePhase = removeExpiredCustomers(withPatience);
    const afterCount = servicePhase.customerQueue.length;
    const updated: DayCycle = { ...ticked, phase: servicePhase };
    this.registry.set("dayCycle", updated);

    // Show notification and animate when customer(s) leave
    if (afterCount < beforeCount) {
      const left = beforeCount - afterCount;
      // Find table IDs of expired customers before they were removed
      const expiredIds = withPatience.customerQueue
        .filter((c) => c.patienceMs <= 0)
        .map((c) => c.id);
      const expiredTableIds = withPatience.tableLayout.tables
        .filter((t) => t.customerId !== undefined && expiredIds.includes(t.customerId))
        .map((t) => t.id);
      this.animateCustomerLeft(expiredTableIds);
      this.showNotification(
        left === 1 ? "Customer left!" : `${left} customers left!`,
        "#ff6666"
      );
    }

    // Expire inventory items past their shelf life
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const now = Date.now();
    const afterExpiry = removeExpired(inv, now);
    if (afterExpiry.items.length < inv.items.length) {
      const expired = inv.items.length - afterExpiry.items.length;
      this.registry.set("inventory", afterExpiry);
      this.showNotification(
        expired === 1 ? "An item expired!" : `${expired} items expired!`,
        "#ff9800"
      );
    }

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const fraction = timerFraction(servicePhase);
    const label = `DAY ${cycle.day} - SERVICE ${formatTimeRemaining(servicePhase.remainingMs)}`;
    this.timerGraphics = renderTimerBar(
      this, 100, 50, 600, 24, fraction, { label }
    );
    this.timerLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;

    this.updateTableTints(servicePhase);
    this.renderInventorySidebar();

    if (isPhaseTimerExpired(updated)) {
      this.customerSpawnTimer?.destroy();
      const ended = advanceToDayEnd(updated);
      this.registry.set("dayCycle", ended);
      this.clearStatus();
      this.showDayEnd(ended);
      return;
    }

    // Auto-begin taking order if waiting and queue non-empty
    if (updated.phase.tag === "service") {
      const phase = updated.phase;
      if (
        phase.subPhase.tag === "waiting_for_customer" &&
        phase.customerQueue.length > 0
      ) {
        const taking = beginTakingOrder(phase);
        if (taking !== undefined) {
          const withTaking: DayCycle = { ...updated, phase: taking };
          this.registry.set("dayCycle", withTaking);
          this.showTakingOrder(withTaking);
          return;
        }
      }

      // Show serving button if back from kitchen
      if (phase.subPhase.tag === "serving") {
        this.showServingPrompt(updated);
      } else if (phase.subPhase.tag === "waiting_for_customer") {
        this.showWaitingStatus(phase.customerQueue.length);
      }
    }
  }

  private spawnCustomer(): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined || cycle.phase.tag !== "service") return;

    // Respect max customers per day
    const difficulty = difficultyForDay(cycle.day);
    if (this.customersSpawned >= difficulty.maxCustomersPerDay) return;

    const empty = emptyTableIds(cycle.phase.tableLayout);
    if (empty.length === 0) return;

    const type = getActiveRestaurantType(this.registry);
    const menuItem = pickRandomDish(type, Math.random());
    const tableId = empty[Math.floor(Math.random() * empty.length)];
    // Patience from difficulty scaling
    const patienceMs =
      difficulty.customerPatienceMinMs +
      Math.floor(
        Math.random() *
          (difficulty.customerPatienceMaxMs - difficulty.customerPatienceMinMs)
      );
    const customer = createCustomer(crypto.randomUUID(), menuItem.dishId, patienceMs);
    this.customersSpawned++;
    const updatedLayout = seatCustomer(cycle.phase.tableLayout, tableId, customer.id);
    const updatedPhase = enqueueCustomer(
      { ...cycle.phase, tableLayout: updatedLayout },
      customer
    );
    this.registry.set("dayCycle", { ...cycle, phase: updatedPhase });

    // Arrival animation: bounce the table sprite
    if (tableId < this.tableSprites.length) {
      const sprite = this.tableSprites[tableId];
      this.tweens.add({
        targets: sprite,
        scaleX: sprite.scaleX * 1.15,
        scaleY: sprite.scaleY * 1.15,
        duration: 150,
        yoyo: true,
        ease: "Bounce.easeOut",
      });
    }
  }

  private showTakingOrder(cycle: DayCycle): void {
    if (cycle.phase.tag !== "service") return;
    if (cycle.phase.subPhase.tag !== "taking_order") return;
    this.clearStatus();

    const centerX = this.scale.width / 2;
    const customer = cycle.phase.subPhase.customer;
    const dishItem = findItem(customer.dishId);
    const dishName = dishItem?.name ?? customer.dishId;

    // Show order bubble
    this.statusObjects.push(
      this.add
        .text(centerX, 200, `ORDER: ${dishName}`, {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#f5a623",
          backgroundColor: "#1a1a2e",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
    );

    // Show dish sprite
    const spriteKey = `item-${customer.dishId}`;
    if (this.textures.exists(spriteKey)) {
      const sprite = this.add
        .image(centerX, 250, spriteKey)
        .setDisplaySize(56, 56);
      this.statusObjects.push(sprite);
    }

    const price = this.getPriceForDish(customer.dishId);

    // Check if dish is already in inventory — offer direct serve
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const hasDish = countItem(inv, customer.dishId) > 0;

    if (hasDish) {
      // "In Stock" indicator
      this.statusObjects.push(
        this.add
          .text(centerX, 285, `In stock! Sell: $${price}`, {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#4caf50",
            backgroundColor: "#1a1a2e",
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5)
      );

      const serveDishId = customer.dishId;
      const serveCustomerId = customer.id;
      this.statusObjects.push(
        addMenuButton(this, centerX - 80, 320, "Serve Now", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "taking_order"
          )
            return;

          // Transition: taking_order → cooking → serving → finishServing
          this.animateServe(serveCustomerId);
          const cooking = beginCooking(
            current.phase,
            crypto.randomUUID(),
            serveDishId
          );
          const serving = finishCooking(cooking);
          const served = finishServing(serving, price);
          const updatedLayout = unseatCustomer(
            served.tableLayout,
            serveCustomerId
          );

          this.removeFromInventory(serveDishId);

          this.registry.set("dayCycle", {
            ...current,
            phase: { ...served, tableLayout: updatedLayout },
          });
          this.clearStatus();
        })
      );
    } else {
      this.statusObjects.push(
        this.add
          .text(centerX, 285, `Sell: $${price}`, {
            fontFamily: "monospace",
            fontSize: "12px",
            color: "#4caf50",
            backgroundColor: "#1a1a2e",
            padding: { x: 6, y: 3 },
          })
          .setOrigin(0.5)
      );

      this.statusObjects.push(
        addMenuButton(this, centerX - 80, 320, "Cook Order", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "taking_order"
          )
            return;

          const cooking = beginCooking(
            current.phase,
            crypto.randomUUID(),
            current.phase.subPhase.customer.dishId
          );
          const withCooking: DayCycle = { ...current, phase: cooking };
          this.registry.set("dayCycle", withCooking);
          this.scene.start("KitchenScene");
        })
      );
    }

    this.statusObjects.push(
      addMenuButton(this, centerX + 80, 320, "Skip", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (
          current === undefined ||
          current.phase.tag !== "service" ||
          current.phase.subPhase.tag !== "taking_order"
        )
          return;

        const custId = activeCustomerId(current.phase);
        const abandoned = abandonOrder(current.phase);
        const updatedLayout =
          custId !== undefined
            ? unseatCustomer(abandoned.tableLayout, custId)
            : abandoned.tableLayout;
        const withAbandoned: DayCycle = {
          ...current,
          phase: { ...abandoned, tableLayout: updatedLayout },
        };
        this.registry.set("dayCycle", withAbandoned);
        this.clearStatus();
      })
    );
  }

  private showServingPrompt(cycle: DayCycle): void {
    if (cycle.phase.tag !== "service" || cycle.phase.subPhase.tag !== "serving")
      return;

    // Only show once
    if (
      this.statusObjects.length > 0 &&
      this.statusObjects.some(
        (obj) =>
          obj instanceof Phaser.GameObjects.Text &&
          (obj as Phaser.GameObjects.Text).text === "Serve Dish"
      )
    )
      return;

    this.clearStatus();
    const centerX = this.scale.width / 2;
    const order = cycle.phase.subPhase.order;
    const dishItem = findItem(order.dishId);
    const dishName = dishItem?.name ?? order.dishId;

    // Check if we have the dish in inventory
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const hasDish = countItem(inv, order.dishId) > 0;

    if (hasDish) {
      this.statusObjects.push(
        this.add
          .text(centerX, 210, `SERVE: ${dishName}`, {
            fontFamily: "monospace",
            fontSize: "16px",
            color: "#4caf50",
            backgroundColor: "#1a1a2e",
            padding: { x: 12, y: 8 },
          })
          .setOrigin(0.5)
      );

      // Show dish sprite
      const spriteKey = `item-${order.dishId}`;
      if (this.textures.exists(spriteKey)) {
        const sprite = this.add
          .image(centerX, 260, spriteKey)
          .setDisplaySize(56, 56);
        this.statusObjects.push(sprite);
      }

      // Capture values before mutation
      const servingCustomerId = order.customerId;
      const servingDishId = order.dishId;

      const price = this.getPriceForDish(servingDishId);

      this.statusObjects.push(
        addMenuButton(this, centerX, 310, "Serve Dish", () => {
          const current: DayCycle | undefined = this.registry.get("dayCycle");
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "serving"
          )
            return;

          this.animateServe(servingCustomerId);
          this.removeFromInventory(servingDishId);

          const served = finishServing(current.phase, price);
          const updatedLayout = unseatCustomer(served.tableLayout, servingCustomerId);
          const withServed: DayCycle = {
            ...current,
            phase: { ...served, tableLayout: updatedLayout },
          };
          this.registry.set("dayCycle", withServed);
          this.clearStatus();
        })
      );
    } else {
      // Don't have the dish — need to go cook it
      this.statusObjects.push(
        this.add
          .text(centerX, 220, `Need: ${dishName}`, {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#f44336",
            backgroundColor: "#1a1a2e",
            padding: { x: 12, y: 8 },
          })
          .setOrigin(0.5)
      );

      this.statusObjects.push(
        this.add
          .text(centerX, 260, "Dish not in inventory!", {
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#888899",
            backgroundColor: "#1a1a2e",
            padding: { x: 8, y: 4 },
          })
          .setOrigin(0.5)
      );
    }
  }

  private showWaitingStatus(queueLength: number): void {
    // Only show once
    if (
      this.statusObjects.length > 0 &&
      this.statusObjects.some(
        (obj) =>
          obj instanceof Phaser.GameObjects.Text &&
          (obj as Phaser.GameObjects.Text).text.includes("Waiting")
      )
    )
      return;

    this.clearStatus();
    const centerX = this.scale.width / 2;
    const msg =
      queueLength > 0
        ? `${queueLength} in queue...`
        : "Waiting for customers...";
    this.statusObjects.push(
      this.add
        .text(centerX, 240, msg, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#888899",
          backgroundColor: "#1a1a2e",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
    );
  }

  private showDayEnd(cycle: DayCycle): void {
    if (this.dayEndShown) return;
    this.dayEndShown = true;
    if (cycle.phase.tag !== "day_end") return;

    this.customerSpawnTimer?.destroy();
    this.clearStatus();

    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    // Dark overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, this.scale.width, this.scale.height);

    this.add
      .text(centerX, centerY - 80, `DAY ${cycle.day} COMPLETE`, {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#f5a623",
      })
      .setOrigin(0.5);

    // Stats
    const earnings = cycle.phase.earnings;
    const served = cycle.phase.customersServed;
    const lost = cycle.phase.customersLost;
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const newWallet = addCoins(wallet, earnings);

    // Record to leaderboard
    const lb: Leaderboard =
      this.registry.get("leaderboard") ?? createLeaderboard();
    this.registry.set(
      "leaderboard",
      recordDayResult(lb, { served, earnings })
    );

    let yPos = centerY - 30;

    this.add
      .text(centerX, yPos, `Customers served: ${served}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    yPos += 28;

    if (lost > 0) {
      this.add
        .text(centerX, yPos, `Customers lost: ${lost}`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#ff6666",
        })
        .setOrigin(0.5);
      yPos += 24;
    }

    this.add
      .text(centerX, yPos, `Earnings: $${earnings}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#4caf50",
      })
      .setOrigin(0.5);
    yPos += 28;

    this.add
      .text(centerX, yPos, `Total: $${newWallet.coins}`, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f5a623",
      })
      .setOrigin(0.5);
    yPos += 40;

    addMenuButton(this, centerX, yPos, "Next Day", () => {
      this.registry.set("wallet", newWallet);

      const next = advanceToNextDay(cycle, defaultDurations);
      this.registry.set("dayCycle", next);
      this.scene.start("GroceryScene");
    });
  }

  private getPriceForDish(dishId: string): number {
    const type = getActiveRestaurantType(this.registry);
    const menu = menuFor(type);
    const menuItem = menu.items.find((mi) => mi.dishId === dishId);
    return menuItem?.sellPrice ?? 5;
  }

  private removeFromInventory(dishId: string): void {
    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const afterRemove = removeItems(inv, dishId, 1);
    if (afterRemove !== undefined) {
      this.registry.set("inventory", afterRemove);
    }
  }

  private renderCoinHud(): void {
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const coinText = formatCoins(wallet);
    const config = createDefaultLayoutConfig();
    const textWidth = measureLineWidth(coinText, config) * config.pixelSize;
    renderPixelText(this, [coinText], {
      x: this.scale.width - textWidth - config.pixelSize * 5,
      y: config.pixelSize * 3,
    });
  }

  private updateTableTints(phase: ServicePhase): void {
    // Build a lookup of customer info by customerId
    const customerMap = new Map<
      string,
      { patienceMs: number; maxPatienceMs: number; dishId: string }
    >();
    phase.customerQueue.forEach((c) => {
      customerMap.set(c.id, {
        patienceMs: c.patienceMs,
        maxPatienceMs: c.maxPatienceMs,
        dishId: c.dishId,
      });
    });
    // Active customer info (taking_order or cooking or serving)
    const activeId = activeCustomerId(phase);
    let activeDishId: string | undefined;
    if (phase.subPhase.tag === "taking_order") {
      activeDishId = phase.subPhase.customer.dishId;
    } else if (
      phase.subPhase.tag === "cooking" ||
      phase.subPhase.tag === "serving"
    ) {
      activeDishId = phase.subPhase.order.dishId;
    }

    // Clear old bubbles
    this.bubbleObjects.forEach((obj) => obj.destroy());
    this.bubbleObjects = [];

    phase.tableLayout.tables.forEach((table, i) => {
      if (i >= this.tableSprites.length) return;
      const sprite = this.tableSprites[i];
      const pos = TABLE_POSITIONS[i];
      if (table.customerId === undefined) {
        sprite.setTint(0xffffff);
        return;
      }

      const isActive = table.customerId === activeId;
      const customer = customerMap.get(table.customerId);

      // Determine dish and patience
      const dishId = isActive ? activeDishId : customer?.dishId;
      const patienceFrac =
        customer !== undefined && customer.maxPatienceMs > 0
          ? customer.patienceMs / customer.maxPatienceMs
          : 1;

      // Tint table
      if (isActive) {
        sprite.setTint(0x6699ff); // blue
      } else {
        sprite.setTint(patienceColor(patienceFrac));
      }

      // Render order bubble (dish sprite) above table
      if (dishId !== undefined) {
        const bubbleY = pos.y + BUBBLE_OFFSET_Y;
        const spriteKey = `item-${dishId}`;
        if (this.textures.exists(spriteKey)) {
          const dishSprite = this.add
            .image(pos.x, bubbleY, spriteKey)
            .setDisplaySize(32, 32)
            .setAlpha(isActive ? 1 : 0.85);
          this.bubbleObjects.push(dishSprite);
        }

        // Patience bar below the dish sprite (skip for active customer)
        if (!isActive && customer !== undefined) {
          const barY = bubbleY + 20;
          const barX = pos.x - PATIENCE_BAR_W / 2;
          const gfx = this.add.graphics();
          // Background
          gfx.fillStyle(0x333333, 0.8);
          gfx.fillRect(barX, barY, PATIENCE_BAR_W, PATIENCE_BAR_H);
          // Fill
          gfx.fillStyle(patienceColor(patienceFrac), 1);
          gfx.fillRect(
            barX,
            barY,
            PATIENCE_BAR_W * patienceFrac,
            PATIENCE_BAR_H
          );
          this.bubbleObjects.push(gfx);
        }
      }
    });
  }

  private renderInventorySidebar(): void {
    this.inventoryObjects.forEach((obj) => obj.destroy());
    this.inventoryObjects = [];

    const inv: Inventory =
      this.registry.get("inventory") ?? createInventory();
    const counts = itemCounts(inv);
    if (counts.length === 0) return;

    // Build freshness lookup for color-coding
    const freshMap = new Map<string, number>();
    itemFreshness(inv, Date.now()).forEach((f) =>
      freshMap.set(f.itemId, f.freshness)
    );

    const x = this.scale.width - 30;
    let y = 90;

    // Show dishes first, then prepped items
    const dishCounts = counts.filter((c) => {
      const item = findItem(c.itemId);
      return item !== undefined && item.category === "dish";
    });
    const preppedCounts = counts.filter((c) => {
      const item = findItem(c.itemId);
      return item !== undefined && item.category === "prepped";
    });

    const freshnessColor = (frac: number): string =>
      frac > 0.5 ? "#ffffff" : frac > 0.25 ? "#ffcc00" : "#ff6644";

    const renderEntry = (itemId: string, count: number): void => {
      const item = findItem(itemId);
      const name = item?.name ?? itemId;
      const display = name.length > 12 ? name.slice(0, 11) + "." : name;
      const freshness = freshMap.get(itemId) ?? 1;
      const color = freshnessColor(freshness);
      const label = this.add
        .text(x, y, `${display} x${count}`, {
          fontFamily: "monospace",
          fontSize: "10px",
          color,
          backgroundColor: "#000000",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(1, 0)
        .setAlpha(0.8);
      this.inventoryObjects.push(label);
      y += 14;
    };

    dishCounts.forEach((c) => renderEntry(c.itemId, c.count));

    if (dishCounts.length > 0 && preppedCounts.length > 0) {
      const divider = this.add
        .text(x, y, "───────", {
          fontFamily: "monospace",
          fontSize: "8px",
          color: "#666677",
        })
        .setOrigin(1, 0)
        .setAlpha(0.6);
      this.inventoryObjects.push(divider);
      y += 10;
    }

    preppedCounts.forEach((c) => renderEntry(c.itemId, c.count));
  }

  private clearStatus(): void {
    this.statusObjects.forEach((obj) => obj.destroy());
    this.statusObjects = [];
  }

  private animateServe(customerId: string): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined || cycle.phase.tag !== "service") return;
    const tableId = cycle.phase.tableLayout.tables.findIndex(
      (t) => t.customerId === customerId
    );
    if (tableId < 0 || tableId >= this.tableSprites.length) return;
    const sprite = this.tableSprites[tableId];
    const pos = TABLE_POSITIONS[tableId];

    // Green coin flash
    const flash = this.add
      .text(pos.x, pos.y - 40, "+$", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#4caf50",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(5);

    this.tweens.add({
      targets: flash,
      y: pos.y - 80,
      alpha: 0,
      duration: 600,
      ease: "Power2",
      onComplete: () => flash.destroy(),
    });

    // Table pop
    this.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.1,
      scaleY: sprite.scaleY * 1.1,
      duration: 100,
      yoyo: true,
    });
  }

  private animateCustomerLeft(tableIds: ReadonlyArray<number>): void {
    tableIds.forEach((tableId) => {
      if (tableId >= this.tableSprites.length) return;
      const sprite = this.tableSprites[tableId];
      // Red flash effect
      sprite.setTint(0xff0000);
      this.time.delayedCall(300, () => {
        sprite.setTint(0xffffff);
      });
    });
  }

  private showNotification(message: string, color: string): void {
    // Clear old notifications
    this.notificationObjects.forEach((obj) => obj.destroy());
    this.notificationObjects = [];

    const centerX = this.scale.width / 2;
    const text = this.add
      .text(centerX, this.scale.height - 30, message, {
        fontFamily: "monospace",
        fontSize: "14px",
        color,
        backgroundColor: "#1a1a2e",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setAlpha(1);
    this.notificationObjects.push(text);

    // Fade out after 2s
    this.tweens.add({
      targets: text,
      alpha: 0,
      duration: 1000,
      delay: 1500,
      onComplete: () => {
        text.destroy();
        this.notificationObjects = this.notificationObjects.filter(
          (obj) => obj !== text
        );
      },
    });
  }
}
