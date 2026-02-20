import Phaser from "phaser";
import { renderPixelText } from "./renderPixelText";
import { recordSceneEntry } from "./saveHelpers";
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
  defaultDurations,
} from "../domain/day-cycle";

export class KitchenScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;
  private cookingTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("KitchenScene");
  }

  preload(): void {
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "kitchen");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "kitchen"));
    }
  }

  create(): void {
    recordSceneEntry(this.registry, "KitchenScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "kitchen"))
      .setDisplaySize(w, h);

    renderPanel(this, { marginTop: 80, marginBottom: 40, marginLeft: 40, marginRight: 40 });

    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    if (cycle.phase.tag === "kitchen_prep") {
      renderPixelText(this, ["THE KITCHEN"], { centerY: 120 });
      renderPixelText(this, ["PREPPING..."], { centerY: 320 });
    } else if (
      cycle.phase.tag === "service" &&
      cycle.phase.subPhase.tag === "cooking"
    ) {
      renderPixelText(this, ["THE KITCHEN"], { centerY: 120 });
      renderPixelText(this, ["COOKING ORDER..."], { centerY: 320 });
      this.cookingTimer = this.time.delayedCall(2_000, () => {
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
      });
    }
  }

  update(_time: number, delta: number): void {
    const cycle: DayCycle | undefined = this.registry.get("dayCycle");
    if (cycle === undefined) return;

    // Only tick for phases with timers
    if (cycle.phase.tag === "day_end") return;

    const updated = tickTimer(cycle, delta);
    this.registry.set("dayCycle", updated);
    if (!isTimedPhase(updated.phase)) return;

    // Determine label based on current mode
    const label =
      updated.phase.tag === "kitchen_prep"
        ? `PREPPING ${formatTimeRemaining(updated.phase.remainingMs)}`
        : `SERVICE ${formatTimeRemaining(updated.phase.remainingMs)}`;

    // Redraw timer bar
    this.timerGraphics?.destroy();
    this.timerLabel?.destroy();
    const fraction = timerFraction(updated.phase);
    this.timerGraphics = renderTimerBar(
      this, 100, 50, 600, 24, fraction, { label }
    );
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
}
