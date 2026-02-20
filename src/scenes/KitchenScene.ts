import Phaser from "phaser";
import { renderPixelText, addNavButton } from "./renderPixelText";

export class KitchenScene extends Phaser.Scene {
  constructor() {
    super("KitchenScene");
  }

  preload(): void {
    this.load.image("kitchen-bg", "assets/kitchen-bg.png");
  }

  create(): void {
    this.add
      .image(this.scale.width / 2, this.scale.height / 2, "kitchen-bg")
      .setDisplaySize(this.scale.width, this.scale.height);

    renderPixelText(this, ["THE KITCHEN"], { centerY: 120 });

    const centerX = this.scale.width / 2;
    const buttonY = 300;
    const spacing = 50;

    addNavButton(this, centerX, buttonY, "Grocery Store", "GroceryScene");
    addNavButton(this, centerX, buttonY + spacing, "Restaurant", "RestaurantScene");
    addNavButton(this, centerX, buttonY + spacing * 2, "Back to Title", "TitleScene");
  }
}
