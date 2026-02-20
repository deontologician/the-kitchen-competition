import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  getGlyph,
  measureLineWidth,
  layoutLines,
  computeCenterOffset,
  createDefaultLayoutConfig,
} from "../pixel-font";

describe("getGlyph", () => {
  it("returns a glyph for every uppercase letter A-Z", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    letters.split("").forEach((ch) => {
      const glyph = getGlyph(ch);
      expect(glyph).toBeDefined();
      expect(glyph!.char).toBe(ch);
    });
  });

  it("is case-insensitive", () => {
    const upper = getGlyph("A");
    const lower = getGlyph("a");
    expect(upper).toEqual(lower);
  });

  it("returns a glyph for space", () => {
    const glyph = getGlyph(" ");
    expect(glyph).toBeDefined();
    expect(glyph!.char).toBe(" ");
  });

  it("returns undefined for unknown characters", () => {
    expect(getGlyph("!")).toBeUndefined();
    expect(getGlyph("@")).toBeUndefined();
  });

  it("returns a glyph for every digit 0-9", () => {
    "0123456789".split("").forEach((ch) => {
      const glyph = getGlyph(ch);
      expect(glyph).toBeDefined();
      expect(glyph!.char).toBe(ch);
    });
  });

  it("digit glyphs are 5 wide and 7 tall", () => {
    "0123456789".split("").forEach((ch) => {
      const glyph = getGlyph(ch)!;
      expect(glyph.width).toBe(5);
      expect(glyph.height).toBe(7);
    });
  });

  it("returns a glyph for the coin icon ($)", () => {
    const glyph = getGlyph("$");
    expect(glyph).toBeDefined();
    expect(glyph!.char).toBe("$");
    expect(glyph!.width).toBe(5);
    expect(glyph!.height).toBe(7);
  });

  it("every glyph has exactly 7 rows", () => {
    const allChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789$";
    allChars.split("").forEach((ch) => {
      const glyph = getGlyph(ch)!;
      expect(glyph.pixels).toHaveLength(7);
    });
  });

  it("every glyph row has width columns and cells are 0 or 1", () => {
    const allChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789$";
    allChars.split("").forEach((ch) => {
      const glyph = getGlyph(ch)!;
      glyph.pixels.forEach((row) => {
        expect(row).toHaveLength(glyph.width);
        row.forEach((cell) => {
          expect(cell === 0 || cell === 1).toBe(true);
        });
      });
    });
  });

  it("every glyph has height 7", () => {
    const allChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789$";
    allChars.split("").forEach((ch) => {
      expect(getGlyph(ch)!.height).toBe(7);
    });
  });
});

describe("measureLineWidth", () => {
  const config = createDefaultLayoutConfig();

  it("returns 0 for empty string", () => {
    expect(measureLineWidth("", config)).toBe(0);
  });

  it("returns the glyph width for a single character", () => {
    // Single char 'A' is 5 wide, no gap after last char
    expect(measureLineWidth("A", config)).toBe(5);
  });

  it("adds charGap between characters", () => {
    // "AB" = 5 + 1(gap) + 5 = 11
    expect(measureLineWidth("AB", config)).toBe(11);
  });

  it("uses spaceWidth for spaces", () => {
    // "A B" = 5 + 1(gap) + 3(space) + 1(gap) + 5 = 15
    expect(measureLineWidth("A B", config)).toBe(15);
  });

  it("handles full words", () => {
    // "THE" = 5 + 1 + 5 + 1 + 5 = 17
    expect(measureLineWidth("THE", config)).toBe(17);
  });

  it("measures digit strings", () => {
    // "10" = 5 + 1(gap) + 5 = 11
    expect(measureLineWidth("10", config)).toBe(11);
  });

  it("measures coin format string", () => {
    // "$10" = 5(coin) + 1(gap) + 5(1) + 1(gap) + 5(0) = 17
    expect(measureLineWidth("$10", config)).toBe(17);
  });
});

describe("layoutLines", () => {
  const config = createDefaultLayoutConfig();

  it("returns empty array for empty input", () => {
    expect(layoutLines([], config)).toEqual([]);
  });

  it("produces pixel positions for a single character", () => {
    const positions = layoutLines(["A"], config);
    expect(positions.length).toBeGreaterThan(0);
    positions.forEach((p) => {
      expect(p.sourceChar).toBe("A");
      expect(p.charIndex).toBe(0);
    });
  });

  it("positions second line below first with lineGap", () => {
    const positions = layoutLines(["A", "B"], config);
    const lineOneYs = positions
      .filter((p) => p.sourceChar === "A")
      .map((p) => p.gridY);
    const lineTwoYs = positions
      .filter((p) => p.sourceChar === "B")
      .map((p) => p.gridY);

    const maxLineOneY = Math.max(...lineOneYs);
    const minLineTwoY = Math.min(...lineTwoYs);
    // Line 2 should start at row 7 + lineGap(3) = 10
    expect(minLineTwoY).toBe(7 + config.lineGap);
  });

  it("offsets characters horizontally within a line", () => {
    const positions = layoutLines(["AB"], config);
    const aPositions = positions.filter((p) => p.charIndex === 0);
    const bPositions = positions.filter((p) => p.charIndex === 1);

    const maxAx = Math.max(...aPositions.map((p) => p.gridX));
    const minBx = Math.min(...bPositions.map((p) => p.gridX));
    // B starts after A's width (5) + gap (1) = column 6
    expect(minBx).toBe(6);
  });

  it("skips space characters (no pixels emitted)", () => {
    const positions = layoutLines(["A B"], config);
    const spacePositions = positions.filter((p) => p.sourceChar === " ");
    expect(spacePositions).toHaveLength(0);
  });

  it("produces positions for digit strings", () => {
    const positions = layoutLines(["10"], config);
    expect(positions.length).toBeGreaterThan(0);
    const chars = [...new Set(positions.map((p) => p.sourceChar))];
    expect(chars).toContain("1");
    expect(chars).toContain("0");
  });

  it("produces positions for coin format", () => {
    const positions = layoutLines(["$10"], config);
    expect(positions.length).toBeGreaterThan(0);
    const chars = [...new Set(positions.map((p) => p.sourceChar))];
    expect(chars).toContain("$");
  });
});

describe("computeCenterOffset", () => {
  const config = createDefaultLayoutConfig();

  it("centers a single pixel block", () => {
    // One pixel at (0,0), canvas 100x100, pixelSize 4
    const positions = [
      { gridX: 0, gridY: 0, sourceChar: "X", charIndex: 0 },
    ] as const;
    const offset = computeCenterOffset(positions, 100, 100, config.pixelSize);
    // Content width = (0+1)*4 = 4, offset.x = (100 - 4) / 2 = 48
    // Content height = (0+1)*4 = 4, offset.y = (100 - 4) / 2 = 48
    expect(offset.x).toBe(48);
    expect(offset.y).toBe(48);
  });

  it("returns 0,0 offset when content fills the canvas", () => {
    const positions = [
      { gridX: 0, gridY: 0, sourceChar: "X", charIndex: 0 },
      { gridX: 24, gridY: 0, sourceChar: "X", charIndex: 0 },
      { gridX: 0, gridY: 24, sourceChar: "X", charIndex: 0 },
    ] as const;
    // width = (24+1)*4 = 100, height = (24+1)*4 = 100
    const offset = computeCenterOffset(positions, 100, 100, config.pixelSize);
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
  });
});

describe("property-based tests", () => {
  const config = createDefaultLayoutConfig();
  const letterArb = fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
  );
  const charArb = fc.constantFrom(
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$".split("")
  );

  it("every letter produces at least one pixel", () => {
    fc.assert(
      fc.property(letterArb, (ch) => {
        const positions = layoutLines([ch], config);
        expect(positions.length).toBeGreaterThanOrEqual(1);
      })
    );
  });

  it("every digit and coin glyph produces at least one pixel", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(..."0123456789$".split("")),
        (ch) => {
          const positions = layoutLines([ch], config);
          expect(positions.length).toBeGreaterThanOrEqual(1);
        }
      )
    );
  });

  it("all pixel positions are non-negative", () => {
    fc.assert(
      fc.property(
        fc.array(letterArb, { minLength: 1, maxLength: 5 }).map((arr) =>
          arr.join("")
        ),
        (text) => {
          const positions = layoutLines([text], config);
          positions.forEach((p) => {
            expect(p.gridX).toBeGreaterThanOrEqual(0);
            expect(p.gridY).toBeGreaterThanOrEqual(0);
          });
        }
      )
    );
  });

  it("measureLineWidth is always non-negative", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789$".split("")), {
          minLength: 0,
          maxLength: 10,
        }).map((arr) => arr.join("")),
        (text) => {
          expect(measureLineWidth(text, config)).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});
