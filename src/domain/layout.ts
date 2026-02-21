/** Canonical rectangle — position + dimensions. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A positioned point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where in a parent rect to anchor. */
export interface Anchor {
  readonly horizontal: "left" | "center" | "right";
  readonly vertical: "top" | "center" | "bottom";
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/** Shrink amounts for insetRect. */
export interface Inset {
  readonly top?: number;
  readonly bottom?: number;
  readonly left?: number;
  readonly right?: number;
}

/** Grid subdivision parameters. */
export interface GridSpec {
  readonly cols: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

/** A positioned grid cell (center point). */
export interface GridCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly col: number;
  readonly row: number;
}

/** Vertical list parameters. */
export interface StackSpec {
  readonly itemHeight: number;
  readonly spacing?: number;
  readonly align?: "left" | "center" | "right";
}

/** A positioned stack entry. */
export interface StackItem {
  readonly x: number;
  readonly y: number;
  readonly index: number;
}

/** Create a rect at origin with given canvas dimensions. */
export const canvasRect = (width: number, height: number): Rect => ({
  x: 0,
  y: 0,
  width,
  height,
});

/** Shrink a rect by padding, clamping dimensions to zero. */
export const insetRect = (rect: Rect, inset: Inset): Rect => {
  const left = inset.left ?? 0;
  const top = inset.top ?? 0;
  const right = inset.right ?? 0;
  const bottom = inset.bottom ?? 0;
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: Math.max(0, rect.width - left - right),
    height: Math.max(0, rect.height - top - bottom),
  };
};

const resolveHorizontal = (
  rect: Rect,
  h: "left" | "center" | "right"
): number => {
  switch (h) {
    case "left":
      return rect.x;
    case "center":
      return rect.x + rect.width / 2;
    case "right":
      return rect.x + rect.width;
  }
};

const resolveVertical = (
  rect: Rect,
  v: "top" | "center" | "bottom"
): number => {
  switch (v) {
    case "top":
      return rect.y;
    case "center":
      return rect.y + rect.height / 2;
    case "bottom":
      return rect.y + rect.height;
  }
};

/** Resolve an anchor to absolute coordinates within a rect. */
export const anchorPoint = (rect: Rect, anchor: Anchor): Point => ({
  x: resolveHorizontal(rect, anchor.horizontal) + (anchor.offsetX ?? 0),
  y: resolveVertical(rect, anchor.vertical) + (anchor.offsetY ?? 0),
});

/** Position a fixed-size rect at an anchor within a parent. */
export const anchoredRect = (
  parent: Rect,
  anchor: Anchor,
  width: number,
  height: number
): Rect => {
  const center = anchorPoint(parent, anchor);
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
};

/** Subdivide a rect into a grid of centered cells. */
export const gridCells = (
  rect: Rect,
  spec: GridSpec,
  count: number
): ReadonlyArray<GridCell> =>
  Array.from({ length: count }, (_, i) => {
    const col = i % spec.cols;
    const row = Math.floor(i / spec.cols);
    return {
      x: rect.x + col * spec.cellWidth + spec.cellWidth / 2,
      y: rect.y + row * spec.cellHeight + spec.cellHeight / 2,
      width: spec.cellWidth,
      height: spec.cellHeight,
      col,
      row,
    };
  });

/** Produce a vertical list of positioned items within a rect. */
export const stackItems = (
  rect: Rect,
  spec: StackSpec,
  count: number
): ReadonlyArray<StackItem> => {
  const spacing = spec.spacing ?? 0;
  const align = spec.align ?? "center";
  const x =
    align === "left"
      ? rect.x
      : align === "right"
        ? rect.x + rect.width
        : rect.x + rect.width / 2;
  return Array.from({ length: count }, (_, i) => ({
    x,
    y: rect.y + spec.itemHeight / 2 + i * (spec.itemHeight + spacing),
    index: i,
  }));
};
