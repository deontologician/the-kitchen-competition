import Phaser from "phaser";

interface TimerBarOptions {
  readonly color?: number;
  readonly backgroundColor?: number;
  readonly borderColor?: number;
  readonly label?: string;
}

const COLOR_GREEN = 0x4caf50;
const COLOR_YELLOW = 0xffeb3b;
const COLOR_RED = 0xf44336;

const fractionColor = (fraction: number): number => {
  if (fraction > 0.5) return COLOR_GREEN;
  if (fraction > 0.25) return COLOR_YELLOW;
  return COLOR_RED;
};

export const renderTimerBar = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
  options: TimerBarOptions = {}
): Phaser.GameObjects.Graphics => {
  const bgColor = options.backgroundColor ?? 0x1a1a2e;
  const borderColor = options.borderColor ?? 0x444466;
  const fillColor = options.color ?? fractionColor(fraction);

  const graphics = scene.add.graphics();

  // Background
  graphics.fillStyle(bgColor, 0.8);
  graphics.fillRect(x, y, width, height);

  // Fill bar
  const fillWidth = Math.max(0, fraction * width);
  graphics.fillStyle(fillColor, 1);
  graphics.fillRect(x, y, fillWidth, height);

  // Border
  graphics.lineStyle(2, borderColor, 1);
  graphics.strokeRect(x, y, width, height);

  // Optional label
  if (options.label !== undefined) {
    scene.add
      .text(x + width / 2, y + height / 2, options.label, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  return graphics;
};

export const formatTimeRemaining = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};
