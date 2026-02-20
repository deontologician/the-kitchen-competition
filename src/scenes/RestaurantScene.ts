import Phaser from "phaser";
import { renderPixelText, addMenuButton } from "./renderPixelText";
import { initialWallet, formatCoins, addCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";
import { recordSceneEntry } from "./saveHelpers";
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
  type Customer,
  type ServicePhase,
  tickTimer,
  isPhaseTimerExpired,
  timerFraction,
  advanceToDayEnd,
  advanceToNextDay,
  enqueueCustomer,
  beginTakingOrder,
  beginCooking,
  finishServing,
  defaultDurations,
} from "../domain/day-cycle";
import {
  emptyTableIds,
  seatCustomer,
  unseatCustomer,
} from "../domain/tables";

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
  private dayEndShown = false;
  private tableSprites: Phaser.GameObjects.Image[] = [];

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

    // Schedule customer arrivals every 10-15s
    this.customerSpawnTimer = this.time.addEvent({
      delay: 10_000 + Math.random() * 5_000,
      callback: () => this.spawnCustomer(),
      loop: true,
    });

    // Spawn first customer quickly
    this.time.delayedCall(2_000, () => this.spawnCustomer());
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;
    if (cycle.phase.tag === "day_end") return;
    if (cycle.phase.tag !== "service") return;

    const updated = tickTimer(cycle, delta);
    this.registry.set("dayCycle", updated);
    if (updated.phase.tag !== "service") return;

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const fraction = timerFraction(updated.phase);
    const label = `SERVICE ${formatTimeRemaining(updated.phase.remainingMs)}`;
    this.timerGraphics = renderTimerBar(
      this, 100, 50, 600, 24, fraction, { label }
    );
    this.timerLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;

    this.updateTableTints(updated.phase);

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

    const empty = emptyTableIds(cycle.phase.tableLayout);
    if (empty.length === 0) return;

    const tableId = empty[Math.floor(Math.random() * empty.length)];
    const customer: Customer = { id: crypto.randomUUID() };
    const updatedLayout = seatCustomer(cycle.phase.tableLayout, tableId, customer.id);
    const updatedPhase = enqueueCustomer(
      { ...cycle.phase, tableLayout: updatedLayout },
      customer
    );
    this.registry.set("dayCycle", { ...cycle, phase: updatedPhase });
  }

  private showTakingOrder(cycle: DayCycle): void {
    if (cycle.phase.tag !== "service") return;
    this.clearStatus();

    const centerX = this.scale.width / 2;
    this.statusObjects.push(
      this.add
        .text(centerX, 220, "CUSTOMER WANTS TO ORDER!", {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#f5a623",
          backgroundColor: "#1a1a2e",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
    );

    this.statusObjects.push(
      addMenuButton(this, centerX, 260, "Take Order", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (
          current === undefined ||
          current.phase.tag !== "service" ||
          current.phase.subPhase.tag !== "taking_order"
        )
          return;

        const cooking = beginCooking(
          current.phase,
          crypto.randomUUID()
        );
        const withCooking: DayCycle = { ...current, phase: cooking };
        this.registry.set("dayCycle", withCooking);
        this.scene.start("KitchenScene");
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

    this.statusObjects.push(
      this.add
        .text(centerX, 220, "DISH READY TO SERVE!", {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#4caf50",
          backgroundColor: "#1a1a2e",
          padding: { x: 12, y: 8 },
        })
        .setOrigin(0.5)
    );

    // Capture customerId before finishServing clears it
    const servingCustomerId =
      cycle.phase.subPhase.tag === "serving"
        ? cycle.phase.subPhase.order.customerId
        : undefined;

    this.statusObjects.push(
      addMenuButton(this, centerX, 260, "Serve Dish", () => {
        const current: DayCycle | undefined = this.registry.get("dayCycle");
        if (
          current === undefined ||
          current.phase.tag !== "service" ||
          current.phase.subPhase.tag !== "serving"
        )
          return;

        const served = finishServing(current.phase);
        // Unseat the customer from their table
        const custId = servingCustomerId ?? current.phase.subPhase.order.customerId;
        const updatedLayout = unseatCustomer(served.tableLayout, custId);
        const withServed: DayCycle = {
          ...current,
          phase: { ...served, tableLayout: updatedLayout },
        };
        this.registry.set("dayCycle", withServed);
        this.clearStatus();
      })
    );
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

    this.add
      .text(
        centerX,
        centerY - 30,
        `Customers served: ${cycle.phase.customersServed}`,
        {
          fontFamily: "monospace",
          fontSize: "16px",
          color: "#ffffff",
        }
      )
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY + 10, `Earnings: $${cycle.phase.earnings}`, {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#4caf50",
      })
      .setOrigin(0.5);

    addMenuButton(this, centerX, centerY + 70, "Next Day", () => {
      // Add earnings to wallet
      const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
      this.registry.set(
        "wallet",
        addCoins(wallet, cycle.phase.tag === "day_end" ? cycle.phase.earnings : 0)
      );

      const next = advanceToNextDay(cycle, defaultDurations);
      this.registry.set("dayCycle", next);
      this.scene.start("GroceryScene");
    });
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
    phase.tableLayout.tables.forEach((table, i) => {
      if (i >= this.tableSprites.length) return;
      const sprite = this.tableSprites[i];
      sprite.setTint(table.customerId !== undefined ? 0x66ff66 : 0xffffff);
    });
  }

  private clearStatus(): void {
    this.statusObjects.forEach((obj) => obj.destroy());
    this.statusObjects = [];
  }
}
