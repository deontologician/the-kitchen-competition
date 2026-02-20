import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  formatTimeRemaining,
  truncateName,
  timerColor,
  freshnessLevel,
  patienceLevel,
} from "../../view/format";

describe("formatTimeRemaining", () => {
  it("formats zero as 0:00", () => {
    expect(formatTimeRemaining(0)).toBe("0:00");
  });

  it("formats exactly 1 second", () => {
    expect(formatTimeRemaining(1_000)).toBe("0:01");
  });

  it("formats 90 seconds as 1:30", () => {
    expect(formatTimeRemaining(90_000)).toBe("1:30");
  });

  it("rounds up partial seconds", () => {
    expect(formatTimeRemaining(500)).toBe("0:01");
    expect(formatTimeRemaining(1_001)).toBe("0:02");
  });

  it("pads seconds to two digits", () => {
    expect(formatTimeRemaining(5_000)).toBe("0:05");
  });

  it("handles 2 minutes exactly", () => {
    expect(formatTimeRemaining(120_000)).toBe("2:00");
  });

  it("always produces M:SS format (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 600_000 }), (ms) => {
        const result = formatTimeRemaining(ms);
        expect(result).toMatch(/^\d+:\d{2}$/);
      })
    );
  });
});

describe("truncateName", () => {
  it("returns short names unchanged", () => {
    expect(truncateName("Bun", 10)).toBe("Bun");
  });

  it("truncates at maxLen with dot suffix", () => {
    expect(truncateName("Ground Beef", 10)).toBe("Ground Be.");
  });

  it("returns exact-length names unchanged", () => {
    expect(truncateName("1234567890", 10)).toBe("1234567890");
  });

  it("truncates names longer than maxLen", () => {
    expect(truncateName("Chicken Breast", 10)).toBe("Chicken B.");
  });

  it("result never exceeds maxLen (property)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 3, max: 20 }),
        (name, maxLen) => {
          expect(truncateName(name, maxLen).length).toBeLessThanOrEqual(maxLen);
        }
      )
    );
  });
});

describe("timerColor", () => {
  it("returns green above 50%", () => {
    expect(timerColor(0.75)).toBe("green");
    expect(timerColor(0.51)).toBe("green");
  });

  it("returns yellow between 25% and 50%", () => {
    expect(timerColor(0.5)).toBe("yellow");
    expect(timerColor(0.26)).toBe("yellow");
  });

  it("returns red at 25% and below", () => {
    expect(timerColor(0.25)).toBe("red");
    expect(timerColor(0.1)).toBe("red");
    expect(timerColor(0)).toBe("red");
  });

  it("always returns a valid color (property)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (frac) => {
        expect(["green", "yellow", "red"]).toContain(timerColor(frac));
      })
    );
  });
});

describe("freshnessLevel", () => {
  it("returns fresh above 50%", () => {
    expect(freshnessLevel(0.75)).toBe("fresh");
    expect(freshnessLevel(0.51)).toBe("fresh");
  });

  it("returns warning between 25% and 50%", () => {
    expect(freshnessLevel(0.5)).toBe("warning");
    expect(freshnessLevel(0.26)).toBe("warning");
  });

  it("returns critical at 25% and below", () => {
    expect(freshnessLevel(0.25)).toBe("critical");
    expect(freshnessLevel(0.1)).toBe("critical");
    expect(freshnessLevel(0)).toBe("critical");
  });
});

describe("patienceLevel", () => {
  it("returns ok above 50%", () => {
    expect(patienceLevel(0.75)).toBe("ok");
    expect(patienceLevel(0.51)).toBe("ok");
  });

  it("returns warning between 25% and 50%", () => {
    expect(patienceLevel(0.5)).toBe("warning");
    expect(patienceLevel(0.26)).toBe("warning");
  });

  it("returns critical at 25% and below", () => {
    expect(patienceLevel(0.25)).toBe("critical");
    expect(patienceLevel(0.1)).toBe("critical");
    expect(patienceLevel(0)).toBe("critical");
  });
});
