import Phaser from "phaser";

/**
 * Animate a serve event: floating "+$" text and table pop.
 */
export const animateServe = (
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  pos: { readonly x: number; readonly y: number }
): void => {
  const flash = scene.add
    .text(pos.x, pos.y - 40, "+$", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: "#4caf50",
      fontStyle: "bold",
    })
    .setOrigin(0.5)
    .setDepth(5);

  scene.tweens.add({
    targets: flash,
    y: pos.y - 80,
    alpha: 0,
    duration: 600,
    ease: "Power2",
    onComplete: () => flash.destroy(),
  });

  scene.tweens.add({
    targets: sprite,
    scaleX: sprite.scaleX * 1.1,
    scaleY: sprite.scaleY * 1.1,
    duration: 100,
    yoyo: true,
  });
};

/**
 * Red flash on table sprites when patience-expired customers leave.
 */
export const animateCustomerLeft = (
  scene: Phaser.Scene,
  tableIds: ReadonlyArray<number>,
  tableSprites: ReadonlyArray<Phaser.GameObjects.Image>
): void => {
  tableIds.forEach((tableId) => {
    if (tableId >= tableSprites.length) return;
    const sprite = tableSprites[tableId];
    sprite.setTint(0xff0000);
    scene.time.delayedCall(300, () => {
      sprite.setTint(0xffffff);
    });
  });
};

/**
 * Bounce a table sprite on customer arrival.
 */
export const animateArrival = (
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image
): void => {
  scene.tweens.add({
    targets: sprite,
    scaleX: sprite.scaleX * 1.15,
    scaleY: sprite.scaleY * 1.15,
    duration: 150,
    yoyo: true,
    ease: "Bounce.easeOut",
  });
};
