import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { resolvePanel, defaultPanelAppearance } from "../panel";

// ---------------------------------------------------------------------------
// resolvePanel
// ---------------------------------------------------------------------------
describe("resolvePanel", () => {
  it("resolves full margins", () => {
    const result = resolvePanel(
      { marginTop: 10, marginBottom: 20, marginLeft: 30, marginRight: 40 },
      800,
      600
    );
    expect(result).toEqual({ x: 30, y: 10, width: 730, height: 570 });
  });

  it("resolves with explicit width and height overrides", () => {
    const result = resolvePanel(
      { marginTop: 50, marginLeft: 50, width: 200, height: 100 },
      800,
      600
    );
    expect(result).toEqual({ x: 50, y: 50, width: 200, height: 100 });
  });

  it("defaults missing margins to 0", () => {
    const result = resolvePanel({}, 800, 600);
    expect(result).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("explicit width takes precedence over right margin", () => {
    const result = resolvePanel(
      { marginLeft: 10, marginRight: 20, width: 300 },
      800,
      600
    );
    expect(result.x).toBe(10);
    expect(result.width).toBe(300);
  });

  it("explicit height takes precedence over bottom margin", () => {
    const result = resolvePanel(
      { marginTop: 10, marginBottom: 20, height: 150 },
      800,
      600
    );
    expect(result.y).toBe(10);
    expect(result.height).toBe(150);
  });

  it("handles mixed margins and overrides", () => {
    const result = resolvePanel(
      { marginTop: 80, marginBottom: 40, marginLeft: 40, marginRight: 40 },
      800,
      600
    );
    expect(result).toEqual({ x: 40, y: 80, width: 720, height: 480 });
  });

  it("returns zero-size panel when margins consume all space", () => {
    const result = resolvePanel(
      { marginLeft: 400, marginRight: 400 },
      800,
      600
    );
    expect(result.width).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("resolved width is always >= 0", () => {
    fc.assert(
      fc.property(
        fc.record({
          marginTop: fc.nat({ max: 300 }),
          marginBottom: fc.nat({ max: 300 }),
          marginLeft: fc.nat({ max: 400 }),
          marginRight: fc.nat({ max: 400 }),
        }),
        (spec) => {
          const result = resolvePanel(spec, 800, 600);
          expect(result.width).toBeGreaterThanOrEqual(0);
          expect(result.height).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// defaultPanelAppearance
// ---------------------------------------------------------------------------
describe("defaultPanelAppearance", () => {
  it("has expected defaults", () => {
    expect(defaultPanelAppearance.fillAlpha).toBeCloseTo(0.55);
    expect(defaultPanelAppearance.borderRadius).toBe(8);
    expect(defaultPanelAppearance.borderWidth).toBeGreaterThan(0);
  });
});
