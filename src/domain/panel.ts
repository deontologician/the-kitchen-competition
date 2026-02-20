export interface PanelSpec {
  readonly marginTop?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
  readonly marginRight?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface ResolvedPanel {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PanelAppearance {
  readonly fillColor: number;
  readonly fillAlpha: number;
  readonly borderRadius: number;
  readonly borderColor: number;
  readonly borderWidth: number;
}

export const defaultPanelAppearance: PanelAppearance = {
  fillColor: 0x000000,
  fillAlpha: 0.55,
  borderRadius: 8,
  borderColor: 0x444466,
  borderWidth: 2,
};

export const resolvePanel = (
  spec: PanelSpec,
  canvasWidth: number,
  canvasHeight: number
): ResolvedPanel => {
  const x = spec.marginLeft ?? 0;
  const y = spec.marginTop ?? 0;
  const width =
    spec.width !== undefined
      ? spec.width
      : Math.max(0, canvasWidth - x - (spec.marginRight ?? 0));
  const height =
    spec.height !== undefined
      ? spec.height
      : Math.max(0, canvasHeight - y - (spec.marginBottom ?? 0));
  return { x, y, width, height };
};
