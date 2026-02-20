import Phaser from "phaser";
import type { TimerColor } from "../domain/view/format";
export { formatTimeRemaining } from "../domain/view/format";

interface TimerBarOptions {
  readonly color?: number;
  readonly backgroundColor?: number;
  readonly borderColor?: number;
  readonly label?: string;
}

export interface TimerBarResult {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text | undefined;
}

const COLOR_GREEN = 0x4caf50;
const COLOR_YELLOW = 0xffeb3b;
const COLOR_RED = 0xf44336;

const fractionColor = (fraction: number): number => {
  if (fraction > 0.5) return COLOR_GREEN;
  if (fraction > 0.25) return COLOR_YELLOW;
  return COLOR_RED;
};

export const TIMER_COLOR_HEX: Readonly<Record<TimerColor, number>> = {
  green: COLOR_GREEN,
  yellow: COLOR_YELLOW,
  red: COLOR_RED,
};

export const renderTimerBar = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  fraction: number,
  options: TimerBarOptions = {}
): TimerBarResult => {
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
  let labelObj: Phaser.GameObjects.Text | undefined;
  if (options.label !== undefined) {
    labelObj = scene.add
      .text(x + width / 2, y + height / 2, options.label, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  return { graphics, label: labelObj };
};
