import Phaser from "phaser";

export interface NotificationState {
  objects: Phaser.GameObjects.GameObject[];
}

export const createNotificationState = (): NotificationState => ({
  objects: [],
});

export const showNotification = (
  scene: Phaser.Scene,
  state: NotificationState,
  message: string,
  color: string
): void => {
  state.objects.forEach((obj) => obj.destroy());
  state.objects = [];

  const centerX = scene.scale.width / 2;
  const text = scene.add
    .text(centerX, scene.scale.height - 30, message, {
      fontFamily: "monospace",
      fontSize: "14px",
      color,
      backgroundColor: "#1a1a2e",
      padding: { x: 10, y: 5 },
    })
    .setOrigin(0.5)
    .setAlpha(1);
  state.objects.push(text);

  scene.tweens.add({
    targets: text,
    alpha: 0,
    duration: 1000,
    delay: 1500,
    onComplete: () => {
      text.destroy();
      state.objects = state.objects.filter((obj) => obj !== text);
    },
  });
};
