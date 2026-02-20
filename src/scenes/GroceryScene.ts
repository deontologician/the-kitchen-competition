import Phaser from "phaser";
import { renderPixelText } from "./renderPixelText";
import { initialWallet, formatCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";
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
    const type = getActiveRestaurantType(this.registry);
    const key = backgroundKey(type, "grocery");
    if (!this.textures.exists(key)) {
      this.load.image(key, backgroundAssetPath(type, "grocery"));
    }
  }

  create(): void {
    recordSceneEntry(this.registry, "GroceryScene");
    const w = this.scale.width;
    const h = this.scale.height;

    const type = getActiveRestaurantType(this.registry);
    this.add
      .image(w / 2, h / 2, backgroundKey(type, "grocery"))
      .setDisplaySize(w, h);

    renderPanel(this, { marginTop: 80, marginBottom: 40, marginLeft: 40, marginRight: 40 });

    renderPixelText(this, ["GROCERY STORE"], { centerY: 120 });

    const wallet: Wallet = this.registry.get("wallet") ?? initialWallet;
    const coinText = formatCoins(wallet);
    const config = createDefaultLayoutConfig();
    const textWidth = measureLineWidth(coinText, config) * config.pixelSize;
    renderPixelText(this, [coinText], {
      x: w - textWidth - config.pixelSize * 5,
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
