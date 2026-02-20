import Phaser from "phaser";
import { renderPixelText } from "./renderPixelText";
import { initialWallet, formatCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";
import { recordSceneEntry } from "./saveHelpers";
import { renderTimerBar, formatTimeRemaining } from "./timerBar";
import {
  type DayCycle,
  tickTimer,
  isPhaseTimerExpired,
  timerFraction,
  advanceToKitchenPrep,
  defaultDurations,
} from "../domain/day-cycle";

export class GroceryScene extends Phaser.Scene {
  private timerGraphics?: Phaser.GameObjects.Graphics;
  private timerLabel?: Phaser.GameObjects.Text;

  constructor() {
    super("GroceryScene");
  }

  preload(): void {
    this.load.image("grocery-bg", "assets/grocery-bg.png");
  }

  create(): void {
    recordSceneEntry(this.registry, "GroceryScene");
    this.add
      .image(this.scale.width / 2, this.scale.height / 2, "grocery-bg")
      .setDisplaySize(this.scale.width, this.scale.height);

    renderPixelText(this, ["GROCERY STORE"], { centerY: 120 });

    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const coinText = formatCoins(wallet);
    const config = createDefaultLayoutConfig();
    const textWidth = measureLineWidth(coinText, config) * config.pixelSize;
    renderPixelText(this, [coinText], {
      x: this.scale.width - textWidth - config.pixelSize * 5,
      y: config.pixelSize * 3,
    });

    renderPixelText(this, ["SHOPPING..."], { centerY: 320 });
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
    const fraction = timerFraction(updated.phase);
    const label = `SHOPPING ${formatTimeRemaining(updated.phase.remainingMs)}`;
    this.timerGraphics = renderTimerBar(
      this, 100, 50, 600, 24, fraction, { label }
    );
    // The label text created by renderTimerBar is the last added child
    this.timerLabel = this.children.list[
      this.children.list.length - 1
    ] as Phaser.GameObjects.Text;

    if (isPhaseTimerExpired(updated)) {
      const next = advanceToKitchenPrep(updated, defaultDurations.kitchenPrepMs);
      this.registry.set("dayCycle", next);
      this.scene.start("KitchenScene");
    }
  }
}
