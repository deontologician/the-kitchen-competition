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

const TABLE_SIZE = 140;
const TABLE_POSITIONS: ReadonlyArray<{ readonly x: number; readonly y: number }> = [
  { x: 180, y: 290 }, { x: 400, y: 290 }, { x: 620, y: 290 },
  { x: 180, y: 460 }, { x: 400, y: 460 }, { x: 620, y: 460 },
];

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
  private notifications: NotificationState = createNotificationState();

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
    showTutorialHint(this, "service");
  }

  update(_time: number, delta: number): void {
    const cycle = this.getCycle();
    if (cycle === undefined) return;
    if (cycle.phase.tag !== "service") return;

    const ticked = tickTimer(cycle, delta);
    if (ticked.phase.tag !== "service") return;

    // Tick customer patience and remove expired
    const withPatience = tickCustomerPatience(ticked.phase, delta);
    const beforeCount = withPatience.customerQueue.length;
    const servicePhase = removeExpiredCustomers(withPatience);
    const afterCount = servicePhase.customerQueue.length;
    const updated: DayCycle = { ...ticked, phase: servicePhase };
    this.registry.set("dayCycle", updated);

    if (afterCount < beforeCount) {
      const left = beforeCount - afterCount;
      const expiredIds = withPatience.customerQueue
        .filter((c) => c.patienceMs <= 0)
        .map((c) => c.id);
      const expiredTableIds = withPatience.tableLayout.tables
        .filter((t) => t.customerId !== undefined && expiredIds.includes(t.customerId))
        .map((t) => t.id);
      animateCustomerLeft(this, expiredTableIds, this.tableSprites);
      showNotification(
        this,
        this.notifications,
        left === 1 ? "Customer left!" : `${left} customers left!`,
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
    const fraction = timerFraction(servicePhase);
    const label = `DAY ${cycle.day} - SERVICE ${formatTimeRemaining(servicePhase.remainingMs)}`;
    this.timerGraphics = renderTimerBar(this, 100, 50, 600, 24, fraction, { label });
    this.timerLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;

    this.updateTableTints(servicePhase);
    this.inventoryObjects = renderInventorySidebar(this, this.getInventory(), this.inventoryObjects);

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

      if (phase.subPhase.tag === "serving") {
        this.showServingPrompt(updated);
      } else if (phase.subPhase.tag === "waiting_for_customer") {
        this.showWaitingStatus(phase.customerQueue.length);
      }
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

    const empty = emptyTableIds(cycle.phase.tableLayout);
    if (empty.length === 0) return;

    const type = getActiveRestaurantType(this.registry);
    const menuItem = pickRandomDish(type, Math.random());
    const tableId = empty[Math.floor(Math.random() * empty.length)];
    const patienceMs =
      difficulty.customerPatienceMinMs +
      Math.floor(
        Math.random() *
          (difficulty.customerPatienceMaxMs - difficulty.customerPatienceMinMs)
      );
    const customer = createCustomer(customerId(crypto.randomUUID()), menuItem.dishId, patienceMs);
    this.customersSpawned++;
    const updatedLayout = seatCustomer(cycle.phase.tableLayout, tableId, customer.id);
    const updatedPhase = enqueueCustomer(
      { ...cycle.phase, tableLayout: updatedLayout },
      customer
    );
    this.registry.set("dayCycle", { ...cycle, phase: updatedPhase });

    if (tableId < this.tableSprites.length) {
      animateArrival(this, this.tableSprites[tableId]);
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

    this.addDishSprite(centerX, 250, customer.dishId);

    const price = this.getPriceForDish(customer.dishId);
    const hasDish = countItem(this.getInventory(), customer.dishId) > 0;

    if (hasDish) {
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
          const current = this.getCycle();
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "taking_order"
          )
            return;

          this.doServe(current, serveCustomerId, serveDishId, price);
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
          const current = this.getCycle();
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "taking_order"
          )
            return;

          const cooking = beginCooking(
            current.phase,
            orderId(crypto.randomUUID()),
            current.phase.subPhase.customer.dishId
          );
          this.registry.set("dayCycle", { ...current, phase: cooking });
          this.scene.start("KitchenScene");
        })
      );
    }

    this.statusObjects.push(
      addMenuButton(this, centerX + 80, 320, "Skip", () => {
        const current = this.getCycle();
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
        this.registry.set("dayCycle", {
          ...current,
          phase: { ...abandoned, tableLayout: updatedLayout },
        });
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

    const hasDish = countItem(this.getInventory(), order.dishId) > 0;

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

      this.addDishSprite(centerX, 260, order.dishId);

      const servingCustomerId = order.customerId;
      const servingDishId = order.dishId;
      const price = this.getPriceForDish(servingDishId);

      this.statusObjects.push(
        addMenuButton(this, centerX, 310, "Serve Dish", () => {
          const current = this.getCycle();
          if (
            current === undefined ||
            current.phase.tag !== "service" ||
            current.phase.subPhase.tag !== "serving"
          )
            return;

          this.doServe(current, servingCustomerId, servingDishId, price);
        })
      );
    } else {
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

    const earnings = cycle.phase.earnings;
    const served = cycle.phase.customersServed;
    const lost = cycle.phase.customersLost;
    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const newWallet = addCoins(wallet, earnings);

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

  /** Serve a dish: animate, remove from inventory, update phase, clear status. */
  private doServe(
    cycle: DayCycle,
    custId: CustomerId,
    dishId: ItemId,
    price: number
  ): void {
    if (cycle.phase.tag !== "service") return;

    this.doAnimateServe(custId);
    this.removeFromInventory(dishId);

    // Fast-track through cooking→serving→finishServing if needed
    const phase = cycle.phase;
    let served: ServicePhase;
    if (phase.subPhase.tag === "taking_order") {
      const cooking = beginCooking(phase, orderId(crypto.randomUUID()), dishId);
      const serving = finishCooking(cooking);
      served = finishServing(serving, price);
    } else {
      served = finishServing(phase, price);
    }
    const updatedLayout = unseatCustomer(served.tableLayout, custId);
    this.registry.set("dayCycle", {
      ...cycle,
      phase: { ...served, tableLayout: updatedLayout },
    });
    this.clearStatus();
  }

  private doAnimateServe(custId: CustomerId): void {
    const cycle = this.getCycle();
    if (cycle === undefined || cycle.phase.tag !== "service") return;
    const tableId = cycle.phase.tableLayout.tables.findIndex(
      (t) => t.customerId === custId
    );
    if (tableId < 0 || tableId >= this.tableSprites.length) return;
    animateServe(this, this.tableSprites[tableId], TABLE_POSITIONS[tableId]);
  }

  private getPriceForDish(dishId: string): number {
    const type = getActiveRestaurantType(this.registry);
    const menu = menuFor(type);
    const menuItem = menu.items.find((mi) => mi.dishId === dishId);
    return menuItem?.sellPrice ?? 5;
  }

  private removeFromInventory(dishId: ItemId): void {
    const inv = this.getInventory();
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
    this.bubbleObjects = renderTableOverlays(
      this,
      phase,
      { positions: TABLE_POSITIONS, sprites: this.tableSprites },
      this.bubbleObjects
    );
  }

  private addDishSprite(x: number, y: number, dishId: string): void {
    const spriteKey = `item-${dishId}`;
    if (this.textures.exists(spriteKey)) {
      const sprite = this.add
        .image(x, y, spriteKey)
        .setDisplaySize(56, 56);
      this.statusObjects.push(sprite);
    }
  }

  private clearStatus(): void {
    this.statusObjects.forEach((obj) => obj.destroy());
    this.statusObjects = [];
  }
}
