import Phaser from "phaser";
import { addNavButton } from "./renderPixelText";
import { type Wallet, initialWallet } from "../domain/wallet";
import {
  createSaveData,
  serializeSave,
  deserializeSave,
  saveDataToWallet,
  SAVE_KEY,
} from "../domain/save-game";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("TitleScene");
  }

  preload(): void {
    this.load.image("title-bg", "assets/title-bg.png");
    this.load.image("title-text", "assets/title-text.png");
  }

  create(): void {
    if (!this.registry.has("wallet")) {
      const raw = localStorage.getItem(SAVE_KEY);
      const saved = raw !== null ? deserializeSave(raw) : undefined;
      const wallet = saved !== undefined ? saveDataToWallet(saved) : initialWallet;
      this.registry.set("wallet", wallet);
    }

    this.registry.events.on(
      "changedata-wallet",
      (_parent: unknown, value: Wallet) => {
        localStorage.setItem(SAVE_KEY, serializeSave(createSaveData(value)));
      }
    );

    this.add
      .image(this.scale.width / 2, this.scale.height / 2, "title-bg")
      .setDisplaySize(this.scale.width, this.scale.height);

    const titleImg = this.add.image(this.scale.width / 2, 180, "title-text");
    titleImg.setScale(
      Math.min(1, (this.scale.width * 0.8) / titleImg.width)
    );

    const centerX = this.scale.width / 2;
    const buttonY = 380;
    const spacing = 50;

    addNavButton(this, centerX, buttonY, "Grocery Store", "GroceryScene");
    addNavButton(this, centerX, buttonY + spacing, "Kitchen", "KitchenScene");
    addNavButton(this, centerX, buttonY + spacing * 2, "Restaurant", "RestaurantScene");
  }
}
