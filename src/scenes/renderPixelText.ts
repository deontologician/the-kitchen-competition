import Phaser from "phaser";
import {
  layoutLines,
  computeCenterOffset,
  createDefaultLayoutConfig,
  type LayoutConfig,
} from "../domain/pixel-font";

export const renderPixelText = (
  scene: Phaser.Scene,
  lines: ReadonlyArray<string>,
  options: {
    readonly color?: number;
    readonly centerY?: number;
    readonly x?: number;
    readonly y?: number;
    readonly config?: LayoutConfig;
  } = {}
): Phaser.GameObjects.Graphics => {
  const config = options.config ?? createDefaultLayoutConfig();
  const color = options.color ?? 0xf5a623;
  const positions = layoutLines(lines, config);

  const useAbsolute = options.x !== undefined && options.y !== undefined;

  const { width, height } = scene.scale;
  const centerOffset = useAbsolute
    ? { x: 0, y: 0 }
    : computeCenterOffset(positions, width, height, config.pixelSize);

  const baseX = useAbsolute ? options.x! : centerOffset.x;
  const baseY = useAbsolute ? options.y! : centerOffset.y;

  const yShift = !useAbsolute && options.centerY !== undefined
    ? options.centerY - height / 2
    : 0;

  const graphics = scene.add.graphics();

  // Draw dark backdrop behind text for contrast
  if (positions.length > 0) {
    const xs = positions.map((p) => baseX + p.gridX * config.pixelSize);
    const ys = positions.map((p) => baseY + p.gridY * config.pixelSize + yShift);
    const padding = config.pixelSize * 3;
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const maxX = Math.max(...xs) + config.pixelSize + padding;
    const maxY = Math.max(...ys) + config.pixelSize + padding;

    graphics.fillStyle(0x000000, 0.55);
    graphics.fillRoundedRect(minX, minY, maxX - minX, maxY - minY, 8);
  }

  graphics.fillStyle(color);

  positions.forEach((p) => {
    graphics.fillRect(
      baseX + p.gridX * config.pixelSize,
      baseY + p.gridY * config.pixelSize + yShift,
      config.pixelSize,
      config.pixelSize
    );
  });

  return graphics;
};

export const addMenuButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void
): Phaser.GameObjects.Text => {
  const button = scene.add
    .text(x, y, label, {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#f5a623",
      backgroundColor: "#2a2a3e",
      padding: { x: 12, y: 8 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  button.on("pointerover", () => button.setStyle({ color: "#ffffff" }));
  button.on("pointerout", () => button.setStyle({ color: "#f5a623" }));
  button.on("pointerdown", onClick);

  return button;
};

export const addNavButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  targetScene: string
): Phaser.GameObjects.Text => {
  const button = scene.add
    .text(x, y, label, {
      fontFamily: "monospace",
      fontSize: "16px",
      color: "#f5a623",
      backgroundColor: "#2a2a3e",
      padding: { x: 12, y: 8 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });

  button.on("pointerover", () => button.setStyle({ color: "#ffffff" }));
  button.on("pointerout", () => button.setStyle({ color: "#f5a623" }));
  button.on("pointerdown", () => scene.scene.start(targetScene));

  return button;
};
