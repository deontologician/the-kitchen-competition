import Phaser from "phaser";
import { TitleScene } from "./scenes/TitleScene";
import { GroceryScene } from "./scenes/GroceryScene";
import { KitchenScene } from "./scenes/KitchenScene";
import { RestaurantScene } from "./scenes/RestaurantScene";
import { LoadGameScene } from "./scenes/LoadGameScene";
import { PauseScene } from "./scenes/PauseScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1d1d2e",
  pixelArt: true,
  scene: [TitleScene, GroceryScene, KitchenScene, RestaurantScene, LoadGameScene, PauseScene],
};

const game = new Phaser.Game(config);

// Expose for debug/testing
(window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
