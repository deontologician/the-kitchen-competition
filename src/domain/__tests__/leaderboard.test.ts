import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createLeaderboard,
  recordDayResult,
  serializeLeaderboard,
  deserializeLeaderboard,
  type Leaderboard,
} from "../leaderboard";

describe("createLeaderboard", () => {
  it("creates empty leaderboard", () => {
    const lb = createLeaderboard();
    expect(lb.bestDayServed).toBe(0);
    expect(lb.bestDayEarnings).toBe(0);
    expect(lb.bestTotalEarnings).toBe(0);
    expect(lb.totalCustomersServed).toBe(0);
    expect(lb.totalDaysPlayed).toBe(0);
  });
});

describe("recordDayResult", () => {
  it("updates best day served when new record", () => {
    const lb = createLeaderboard();
    const updated = recordDayResult(lb, { served: 5, earnings: 30 });
    expect(updated.bestDayServed).toBe(5);
  });

  it("keeps existing best when not beaten", () => {
    let lb = recordDayResult(createLeaderboard(), { served: 10, earnings: 50 });
    lb = recordDayResult(lb, { served: 3, earnings: 20 });
    expect(lb.bestDayServed).toBe(10);
  });

  it("updates best day earnings", () => {
    const lb = recordDayResult(createLeaderboard(), { served: 2, earnings: 40 });
    expect(lb.bestDayEarnings).toBe(40);
  });

  it("accumulates total earnings as best total", () => {
    let lb = recordDayResult(createLeaderboard(), { served: 3, earnings: 20 });
    lb = recordDayResult(lb, { served: 4, earnings: 30 });
    expect(lb.bestTotalEarnings).toBe(50);
  });

  it("accumulates total customers served", () => {
    let lb = recordDayResult(createLeaderboard(), { served: 3, earnings: 20 });
    lb = recordDayResult(lb, { served: 5, earnings: 30 });
    expect(lb.totalCustomersServed).toBe(8);
  });

  it("increments total days played", () => {
    let lb = recordDayResult(createLeaderboard(), { served: 1, earnings: 5 });
    lb = recordDayResult(lb, { served: 2, earnings: 10 });
    expect(lb.totalDaysPlayed).toBe(2);
  });
});

describe("serialization", () => {
  it("round-trips through serialize/deserialize", () => {
    let lb = recordDayResult(createLeaderboard(), { served: 7, earnings: 42 });
    lb = recordDayResult(lb, { served: 3, earnings: 18 });
    const json = serializeLeaderboard(lb);
    const restored = deserializeLeaderboard(json);
    expect(restored).toEqual(lb);
  });

  it("returns undefined for invalid input", () => {
    expect(deserializeLeaderboard("not json")).toBeUndefined();
    expect(deserializeLeaderboard("{}")).toBeUndefined();
    expect(deserializeLeaderboard("null")).toBeUndefined();
  });

  it("returns undefined when fields are wrong type", () => {
    const bad = JSON.stringify({ bestDayServed: "not a number" });
    expect(deserializeLeaderboard(bad)).toBeUndefined();
  });
});

describe("property-based tests", () => {
  it("best day served is always >= any individual day", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            served: fc.integer({ min: 0, max: 50 }),
            earnings: fc.integer({ min: 0, max: 200 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (days) => {
          let lb = createLeaderboard();
          days.forEach((d) => {
            lb = recordDayResult(lb, d);
          });
          const maxServed = Math.max(...days.map((d) => d.served));
          expect(lb.bestDayServed).toBe(maxServed);
        }
      )
    );
  });

  it("total customers = sum of all days served", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            served: fc.integer({ min: 0, max: 50 }),
            earnings: fc.integer({ min: 0, max: 200 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (days) => {
          let lb = createLeaderboard();
          days.forEach((d) => {
            lb = recordDayResult(lb, d);
          });
          const totalServed = days.reduce((sum, d) => sum + d.served, 0);
          expect(lb.totalCustomersServed).toBe(totalServed);
        }
      )
    );
  });

  it("serialization round-trips for any leaderboard", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            served: fc.integer({ min: 0, max: 50 }),
            earnings: fc.integer({ min: 0, max: 200 }),
          }),
          { minLength: 0, maxLength: 10 }
        ),
        (days) => {
          let lb = createLeaderboard();
          days.forEach((d) => {
            lb = recordDayResult(lb, d);
          });
          const restored = deserializeLeaderboard(serializeLeaderboard(lb));
          expect(restored).toEqual(lb);
        }
      )
    );
  });
});
