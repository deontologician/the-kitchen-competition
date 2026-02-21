import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import { initialWallet, formatCoins, addCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";
import { recordSceneEntry } from "./saveHelpers";
import { renderTimerBar } from "./timerBar";
import { renderPanel } from "./panel";
import {
  getActiveRestaurantType,
  getActiveUnlockedCount,
  getActiveDisabledDishes,
  backgroundKey,
  backgroundAssetPath,
  tableKey,
  tableAssetPath,
} from "./restaurantTypeHelper";
import {
  type DayCycle,
  type ServicePhase,
  type TableState,
  createCustomer,
  tickTimer,
  isPhaseTimerExpired,
  timerFraction,
  advanceToDayEnd,
  advanceToNextDay,
  enqueueCustomer,
  takeOrder,
  sendOrderToKitchen,
  serveOrder,
  serveDirectFromInventory,
  movePlayer,
  tickServicePhase,
  isRestaurantIdle,
  defaultDurations,
} from "../domain/day-cycle";
import { pickRandomDish, unlockedMenuFor } from "../domain/menu";
import { findItem } from "../domain/items";
import {
  createInventory,
  countItem,
  removeItems,
  removeExpired,
  type Inventory,
} from "../domain/inventory";
import { difficultyForDay } from "../domain/difficulty";
import {
  type Leaderboard,
  createLeaderboard,
  recordDayResult,
} from "../domain/leaderboard";
import {
  type NotificationState,
  createNotificationState,
  showNotification,
} from "./notification";
import { renderInventorySidebar } from "./inventorySidebar";
import { renderTableOverlays, type TablePositions } from "./tableRenderer";
import { type CustomerId, type ItemId, customerId, orderId } from "../domain/branded";
import {
  animateServe,
  animateCustomerLeft,
  animateArrival,
} from "./serviceAnimations";
import type { SlotId } from "../domain/branded";
import {
  type SaveStore,
  findSlot,
  updateSlot,
  patchSlot,
} from "../domain/save-slots";
import { timerBarVM } from "../domain/view/timer-vm";
import { restaurantVM, getServingInfo, getOrderPendingInfo } from "../domain/view/restaurant-vm";
import { dayEndVM } from "../domain/view/day-end-vm";
import {
  canvas,
  timerBar,
  restaurantTitleY,
  tablePositions,
  TABLE_SIZE,
} from "../domain/view/scene-layout";

export class RestaurantScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private coinHudGraphics?: Phaser.GameObjects.Graphics;
  private customerSpawnTimer?: Phaser.Time.TimerEvent;
  private tableActionObjects: Phaser.GameObjects.GameObject[][] = [];
  private tableActionStates: string[] = []; // last rendered tag per table
  private inventoryObjects: Phaser.GameObjects.GameObject[] = [];
  private bubbleObjects: Phaser.GameObjects.GameObject[] = [];
  private kitchenButtonObjects: Phaser.GameObjects.GameObject[] = [];
  private lastKitchenBadge = -1;
  private dayEndShown = false;
  private tableSprites: Phaser.GameObjects.Image[] = [];
  private customersSpawned = 0;
  private notifications: NotificationState = createNotificationState();
  private tableCells: ReadonlyArray<{ readonly x: number; readonly y: number }> = [];

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
    const unlocked = getActiveUnlockedCount(this.registry);
    const menu = unlockedMenuFor(type, unlocked);
    menu.items.forEach((mi) => {
      const spriteKey = `item-${mi.dishId}`;
      if (!this.textures.exists(spriteKey)) {
        this.load.image(spriteKey, `assets/items/${mi.dishId}.png`);
      }
    });
  }

  create(): void {
    this.dayEndShown = false;
    this.tableActionObjects = [];
    this.tableActionStates = [];
    this.kitchenButtonObjects = [];
    this.lastKitchenBadge = -1;
    this.tableSprites = [];
    this.coinHudGraphics = undefined;
    this.notifications = createNotificationState();
    recordSceneEntry(this.registry, "RestaurantScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "restaurant"))
      .setDisplaySize(w, h);

    const tKey = tableKey(type);
    const cycle = this.getCycle();
    const numTables =
      cycle !== undefined && cycle.phase.tag === "service"
        ? cycle.phase.tables.length
        : 4;

    this.tableCells = tablePositions(numTables);
    this.tableCells.forEach((pos) => {
      const sprite = this.add.image(pos.x, pos.y, tKey).setDisplaySize(TABLE_SIZE, TABLE_SIZE);
      this.tableSprites.push(sprite);
    });

    // Pre-allocate per-table action object arrays
    this.tableActionObjects = Array.from({ length: numTables }, () => []);
    this.tableActionStates = Array.from({ length: numTables }, () => "");

    renderPanel(this, { marginTop: 80, marginBottom: 40, marginLeft: 40, marginRight: 40 }, { fillAlpha: 0.35 });
    renderPixelText(this, ["RESTAURANT"], { centerY: restaurantTitleY });
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

    this.time.delayedCall(2_000, () => this.spawnCustomer());
  }

  update(_time: number, delta: number): void {
    const cycle = this.getCycle();
    if (cycle === undefined) return;
    if (cycle.phase.tag !== "service") return;

    const prevTables = cycle.phase.tables;
    const ticked = tickTimer(cycle, delta);
    if (ticked.phase.tag !== "service") return;

    // Combined service tick (patience + expiry + kitchen)
    const servicePhase = tickServicePhase(ticked.phase, delta);
    const updated: DayCycle = { ...ticked, phase: servicePhase };
    this.registry.set("dayCycle", updated);

    // Detect customers who left (tables that went from non-empty to empty)
    const departedTableIds = prevTables.reduce<number[]>((acc, prev, i) => {
      const curr = servicePhase.tables[i];
      if (prev.tag !== "empty" && curr?.tag === "empty") acc.push(i);
      return acc;
    }, []);
    const lostCount = servicePhase.customersLost - cycle.phase.customersLost;
    if (lostCount > 0) {
      animateCustomerLeft(this, departedTableIds, this.tableSprites);
      showNotification(
        this,
        this.notifications,
        lostCount === 1 ? "Customer left!" : `${lostCount} customers left!`,
        "#ff6666"
      );
    }

    // Expire inventory items past shelf life
    const inv = this.getInventory();
    const now = Date.now();
    const afterExpiry = removeExpired(inv, now);
    if (afterExpiry.items.length < inv.items.length) {
      const expired = inv.items.length - afterExpiry.items.length;
      this.registry.set("inventory", afterExpiry);
      showNotification(
        this,
        this.notifications,
        expired === 1 ? "An item expired!" : `${expired} items expired!`,
        "#ff9800"
      );
    }

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const timerVM = timerBarVM(servicePhase, cycle.day);
    if (timerVM !== undefined) {
      const result = renderTimerBar(
        this,
        timerBar.x, timerBar.y, timerBar.width, timerBar.height,
        timerVM.fraction,
        { label: timerVM.label }
      );
      this.timerGraphics = result.graphics;
      this.timerLabel = result.label;
    }

    this.updateTableTints(servicePhase);
    this.updateTableActionButtons(servicePhase);
    this.updateKitchenButton(servicePhase);
    this.inventoryObjects = renderInventorySidebar(this, this.getInventory(), this.inventoryObjects);
    this.renderCoinHud();

    if (isPhaseTimerExpired(updated)) {
      this.customerSpawnTimer?.destroy();
      const ended = advanceToDayEnd(updated);
      this.registry.set("dayCycle", ended);
      this.clearAllTableButtons();
      this.clearKitchenButton();
      this.showDayEnd(ended);
      return;
    }

    // End day early when restaurant is idle and inventory has no food left
    if (isRestaurantIdle(servicePhase) && this.getInventory().items.length === 0) {
      this.customerSpawnTimer?.destroy();
      const ended = advanceToDayEnd(updated);
      this.registry.set("dayCycle", ended);
      this.clearAllTableButtons();
      this.clearKitchenButton();
      this.showDayEnd(ended);
      return;
    }
  }

  private getCycle(): DayCycle | undefined {
    return this.registry.get("dayCycle");
  }

  private getInventory(): Inventory {
    return this.registry.get("inventory") ?? createInventory();
  }

  private spawnCustomer(): void {
    const cycle = this.getCycle();
    if (cycle === undefined || cycle.phase.tag !== "service") return;

    const difficulty = difficultyForDay(cycle.day);
    if (this.customersSpawned >= difficulty.maxCustomersPerDay) return;

    // Check if there's any room (table or queue) to accept customers
    const allFull = cycle.phase.tables.every((t) => t.tag !== "empty") &&
      cycle.phase.tables.length > 0;
    if (allFull) return; // Don't spawn if all tables occupied (queue-less model)

    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const disabledDishes = getActiveDisabledDishes(this.registry);
    const menuItem = pickRandomDish(type, Math.random(), unlockedCount, disabledDishes);
    const patienceMs =
      difficulty.customerPatienceMinMs +
      Math.floor(
        Math.random() *
          (difficulty.customerPatienceMaxMs - difficulty.customerPatienceMinMs)
      );
    const customer = createCustomer(customerId(crypto.randomUUID()), menuItem.dishId, patienceMs);
    this.customersSpawned++;

    // enqueueCustomer auto-seats at first empty table
    const updatedPhase = enqueueCustomer(cycle.phase, customer);
    this.registry.set("dayCycle", { ...cycle, phase: updatedPhase });

    // Find which table was seated and animate it
    const seatedIdx = updatedPhase.tables.findIndex(
      (t) => t.tag === "customer_waiting" &&
        t.customer.id === customer.id
    );
    if (seatedIdx >= 0 && seatedIdx < this.tableSprites.length) {
      animateArrival(this, this.tableSprites[seatedIdx]);
    }
  }

  // ---------------------------------------------------------------------------
  // Per-table action buttons
  // ---------------------------------------------------------------------------

  private updateTableActionButtons(phase: ServicePhase): void {
    const type = getActiveRestaurantType(this.registry);
    const unlockedCount = getActiveUnlockedCount(this.registry);
    const inv = this.getInventory();

    phase.tables.forEach((tableState, tableId) => {
      const lastState = this.tableActionStates[tableId] ?? "";
      // Use a compound key that also encodes hasDish for order_pending
      const hasDish = tableState.tag === "order_pending" || tableState.tag === "customer_waiting"
        ? countItem(inv, (tableState as { customer: { dishId: string } }).customer?.dishId ?? "") > 0
        : false;
      const stateKey = tableState.tag + (hasDish ? "_has" : "_no");

      if (stateKey === lastState) return; // no change

      // Destroy old buttons for this table
      this.tableActionObjects[tableId]?.forEach((obj) => obj.destroy());
      this.tableActionObjects[tableId] = [];
      this.tableActionStates[tableId] = stateKey;

      if (!this.tableCells[tableId]) return;
      const pos = this.tableCells[tableId];
      const btnX = pos.x;
      const btnY = pos.y + 50;

      switch (tableState.tag) {
        case "customer_waiting": {
          const dishId = tableState.customer.dishId;
          const hasDishNow = countItem(inv, dishId) > 0;
          if (hasDishNow) {
            // Fast path: dish already prepped — show "Serve Now"
            const info = getOrderPendingInfo(
              { ...phase, tables: phase.tables.map((t, i) => i === tableId ? { tag: "order_pending" as const, customer: tableState.customer } : t) },
              tableId, inv, type, unlockedCount
            );
            const price = info?.sellPrice ?? 5;
            const btn = addMenuButton(this, btnX, btnY, "Serve Now", () => {
              const current = this.getCycle();
              if (!current || current.phase.tag !== "service") return;
              const t = current.phase.tables[tableId];
              if (t.tag !== "customer_waiting") return;
              this.doServe(tableId, t.customer.id, t.customer.dishId, price);
            });
            this.tableActionObjects[tableId].push(btn);
          } else {
            // Show "Take Order" button
            const btn = addMenuButton(this, btnX, btnY, "Take Order", () => {
              const current = this.getCycle();
              if (!current || current.phase.tag !== "service") return;
              const updated = takeOrder(current.phase, tableId);
              this.registry.set("dayCycle", { ...current, phase: updated });
              // Force button state refresh
              if (this.tableActionStates[tableId]) {
                this.tableActionStates[tableId] = "";
              }
            });
            this.tableActionObjects[tableId].push(btn);
          }
          break;
        }

        case "order_pending": {
          const dishId = tableState.customer.dishId;
          const hasDishNow = countItem(inv, dishId) > 0;
          const info = getOrderPendingInfo(phase, tableId, inv, type, unlockedCount);
          const price = info?.sellPrice ?? 5;

          if (hasDishNow) {
            // Dish is in inventory — serve directly
            const btn = addMenuButton(this, btnX, btnY, "Serve Now", () => {
              const current = this.getCycle();
              if (!current || current.phase.tag !== "service") return;
              const t = current.phase.tables[tableId];
              if (t.tag !== "order_pending") return;
              this.doServe(tableId, t.customer.id, t.customer.dishId, price);
            });
            this.tableActionObjects[tableId].push(btn);
          } else {
            // Send to kitchen
            const btn = addMenuButton(this, btnX, btnY, "To Kitchen", () => {
              const current = this.getCycle();
              if (!current || current.phase.tag !== "service") return;
              const t = current.phase.tables[tableId];
              if (t.tag !== "order_pending") return;
              const oid = orderId(crypto.randomUUID());
              const updated = sendOrderToKitchen(current.phase, tableId, oid);
              this.registry.set("dayCycle", { ...current, phase: updated });
            });
            this.tableActionObjects[tableId].push(btn);
          }
          break;
        }

        case "in_kitchen":
          // No button — order is being cooked
          break;

        case "ready_to_serve": {
          const info = getServingInfo(phase, tableId, inv, type, unlockedCount);
          if (info !== undefined) {
            const price = info.sellPrice;
            const custId = info.customerId;
            const dId = info.dishId;
            const btn = addMenuButton(this, btnX, btnY, "Serve!", () => {
              const current = this.getCycle();
              if (!current || current.phase.tag !== "service") return;
              const t = current.phase.tables[tableId];
              if (t.tag !== "ready_to_serve") return;
              this.doServeFromOrderUp(tableId, custId, dId, price);
            });
            this.tableActionObjects[tableId].push(btn);
          }
          break;
        }

        case "empty":
          // No button
          break;
      }
    });
  }

  private clearAllTableButtons(): void {
    this.tableActionObjects.forEach((objs) => objs.forEach((obj) => obj.destroy()));
    this.tableActionObjects = [];
    this.tableActionStates = [];
  }

  // ---------------------------------------------------------------------------
  // Kitchen button
  // ---------------------------------------------------------------------------

  private updateKitchenButton(phase: ServicePhase): void {
    const badge = phase.kitchen.orderUp.length;
    if (badge === this.lastKitchenBadge) return;
    this.lastKitchenBadge = badge;

    this.clearKitchenButton();

    const label = badge > 0 ? `Kitchen (${badge} ready!)` : "Kitchen \u25BA";
    const btn = addMenuButton(this, canvas.width - 90, canvas.height - 55, label, () => {
      const current = this.getCycle();
      if (!current || current.phase.tag !== "service") return;
      const updated = movePlayer(current.phase, "kitchen");
      this.registry.set("dayCycle", { ...current, phase: updated });
      this.scene.start("KitchenScene");
    });
    this.kitchenButtonObjects.push(btn);
  }

  private clearKitchenButton(): void {
    this.kitchenButtonObjects.forEach((obj) => obj.destroy());
    this.kitchenButtonObjects = [];
  }

  // ---------------------------------------------------------------------------
  // Serving
  // ---------------------------------------------------------------------------

  /** Serve from pre-prepped inventory (bypasses kitchen orderUp). */
  private doServe(tableId: number, custId: CustomerId, dishId: ItemId, price: number): void {
    const cycle = this.getCycle();
    if (!cycle || cycle.phase.tag !== "service") return;

    this.removeFromInventory(dishId);
    this.doAnimateServe(tableId);

    const updated = serveDirectFromInventory(cycle.phase, tableId, price);
    this.registry.set("dayCycle", { ...cycle, phase: updated });
    // Force refresh of buttons
    if (this.tableActionStates[tableId]) this.tableActionStates[tableId] = "";
  }

  /** Serve from kitchen orderUp. */
  private doServeFromOrderUp(tableId: number, custId: CustomerId, dishId: ItemId, price: number): void {
    const cycle = this.getCycle();
    if (!cycle || cycle.phase.tag !== "service") return;

    this.removeFromInventory(dishId);
    this.doAnimateServe(tableId);

    const updated = serveOrder(cycle.phase, tableId, price);
    this.registry.set("dayCycle", { ...cycle, phase: updated });
    if (this.tableActionStates[tableId]) this.tableActionStates[tableId] = "";
  }

  private doAnimateServe(tableId: number): void {
    if (tableId < this.tableSprites.length) {
      animateServe(this, this.tableSprites[tableId], this.tableCells[tableId]);
    }
  }

  private removeFromInventory(dishId: ItemId): void {
    const inv = this.getInventory();
    const afterRemove = removeItems(inv, dishId, 1);
    if (afterRemove !== undefined) {
      this.registry.set("inventory", afterRemove);
    }
  }

  // ---------------------------------------------------------------------------
  // Day end
  // ---------------------------------------------------------------------------

  private showDayEnd(cycle: DayCycle): void {
    if (this.dayEndShown) return;
    this.dayEndShown = true;
    if (cycle.phase.tag !== "day_end") return;

    this.customerSpawnTimer?.destroy();
    this.clearAllTableButtons();
    this.clearKitchenButton();

    const type = getActiveRestaurantType(this.registry);
    const currentUnlocked = getActiveUnlockedCount(this.registry);
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const vm = dayEndVM(cycle.phase, cycle.day, wallet, type, currentUnlocked);

    const newWallet = addCoins(wallet, vm.earnings);

    const lb: Leaderboard =
      this.registry.get("leaderboard") ?? createLeaderboard();
    this.registry.set(
      "leaderboard",
      recordDayResult(lb, { served: vm.customersServed, earnings: vm.earnings })
    );

    if (vm.dishUnlock !== undefined) {
      const store: SaveStore | undefined = this.registry.get("saveStore");
      const activeSlotId: SlotId | undefined = this.registry.get("activeSlotId");
      if (store !== undefined && activeSlotId !== undefined) {
        const slot = findSlot(store, activeSlotId);
        if (slot !== undefined) {
          const updated = patchSlot(slot, {
            unlockedDishes: vm.dishUnlock.newUnlockedCount,
            lastSaved: Date.now(),
          });
          this.registry.set("saveStore", updateSlot(store, updated));
        }
      }
    }

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, canvas.width, canvas.height);

    this.add
      .text(centerX, centerY - 80, `DAY ${vm.day} COMPLETE`, {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#f5a623",
      })
      .setOrigin(0.5);

    let yPos = centerY - 30;

    this.add
      .text(centerX, yPos, `Customers served: ${vm.customersServed}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    yPos += 28;

    if (vm.customersLost > 0) {
      this.add
        .text(centerX, yPos, `Customers lost: ${vm.customersLost}`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#ff6666",
        })
        .setOrigin(0.5);
      yPos += 24;
    }

    this.add
      .text(centerX, yPos, `Earnings: $${vm.earnings}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#4caf50",
      })
      .setOrigin(0.5);
    yPos += 28;

    this.add
      .text(centerX, yPos, `Total: $${vm.newTotalCoins}`, {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#f5a623",
      })
      .setOrigin(0.5);
    yPos += 28;

    if (vm.dishUnlock !== undefined) {
      this.add
        .text(centerX, yPos, `NEW DISH UNLOCKED: ${vm.dishUnlock.dishName}!`, {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#00e5ff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      yPos += 28;

      if (this.textures.exists(vm.dishUnlock.dishSpriteKey)) {
        this.add
          .image(centerX, yPos, vm.dishUnlock.dishSpriteKey)
          .setDisplaySize(48, 48);
        yPos += 36;
      }
    }

    yPos += 12;

    addMenuButton(this, centerX, yPos, "Next Day", () => {
      this.registry.set("wallet", newWallet);
      const next = advanceToNextDay(cycle, defaultDurations);
      this.registry.set("dayCycle", next);
      this.scene.start("GroceryScene");
    });
  }

  // ---------------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------------

  private renderCoinHud(): void {
    this.coinHudGraphics?.destroy();
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const cycle: DayCycle | undefined = this.getCycle();
    const liveEarnings = cycle?.phase.tag === "service" ? cycle.phase.earnings : 0;
    const coinText = formatCoins({ coins: wallet.coins + liveEarnings });
    const config = createDefaultLayoutConfig();
    const textWidth = measureLineWidth(coinText, config) * config.pixelSize;
    this.coinHudGraphics = renderPixelText(this, [coinText], {
      x: this.scale.width - textWidth - config.pixelSize * 5,
      y: config.pixelSize * 3,
    });
  }

  private updateTableTints(phase: ServicePhase): void {
    this.bubbleObjects = renderTableOverlays(
      this,
      phase,
      { positions: this.tableCells, sprites: this.tableSprites },
      this.bubbleObjects
    );
  }
}
