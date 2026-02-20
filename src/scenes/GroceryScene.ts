import Phaser from "phaser";
import { renderPixelText, addNavButton } from "./renderPixelText";
import { initialWallet, formatCoins, type Wallet } from "../domain/wallet";
import { measureLineWidth, createDefaultLayoutConfig } from "../domain/pixel-font";

export class GroceryScene extends Phaser.Scene {
  constructor() {
    super("GroceryScene");
  }

  preload(): void {
    this.load.image("grocery-bg", "assets/grocery-bg.png");
  }

  create(): void {
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

    const centerX = this.scale.width / 2;
    const buttonY = 300;
    const spacing = 50;

    addNavButton(this, centerX, buttonY, "Kitchen", "KitchenScene");
    addNavButton(this, centerX, buttonY + spacing, "Restaurant", "RestaurantScene");
    addNavButton(this, centerX, buttonY + spacing * 2, "Back to Title", "TitleScene");
  }
}
