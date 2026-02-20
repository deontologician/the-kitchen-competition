import Phaser from "phaser";
import {
  resolvePanel,
  defaultPanelAppearance,
  type PanelSpec,
  type PanelAppearance,
} from "../domain/panel";

export const renderPanel = (
  scene: Phaser.Scene,
  spec: PanelSpec,
  appearance?: Partial<PanelAppearance>
): Phaser.GameObjects.Graphics => {
  const resolved = resolvePanel(spec, scene.scale.width, scene.scale.height);
  const a = { ...defaultPanelAppearance, ...appearance };

  const graphics = scene.add.graphics();
  graphics.fillStyle(a.fillColor, a.fillAlpha);
  graphics.fillRoundedRect(
    resolved.x,
    resolved.y,
    resolved.width,
    resolved.height,
    a.borderRadius
  );

  if (a.borderWidth > 0) {
    graphics.lineStyle(a.borderWidth, a.borderColor, 1);
    graphics.strokeRoundedRect(
      resolved.x,
      resolved.y,
      resolved.width,
      resolved.height,
      a.borderRadius
    );
  }

  return graphics;
};
