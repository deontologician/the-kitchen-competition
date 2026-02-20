import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  difficultyForDay,
  type DayDifficulty,
} from "../difficulty";

describe("difficultyForDay", () => {
  it("returns base difficulty for day 1", () => {
    const d = difficultyForDay(1);
    expect(d.customerSpawnMinMs).toBe(10_000);
    expect(d.customerSpawnMaxMs).toBe(15_000);
    expect(d.customerPatienceMinMs).toBe(45_000);
    expect(d.customerPatienceMaxMs).toBe(75_000);
    expect(d.maxCustomersPerDay).toBe(8);
  });

  it("increases difficulty on day 3", () => {
    const d1 = difficultyForDay(1);
    const d3 = difficultyForDay(3);
    // Customers spawn faster
    expect(d3.customerSpawnMinMs).toBeLessThan(d1.customerSpawnMinMs);
    // Less patience
    expect(d3.customerPatienceMaxMs).toBeLessThan(d1.customerPatienceMaxMs);
    // More customers
    expect(d3.maxCustomersPerDay).toBeGreaterThan(d1.maxCustomersPerDay);
  });

  it("increases difficulty on day 7", () => {
    const d3 = difficultyForDay(3);
    const d7 = difficultyForDay(7);
    expect(d7.customerSpawnMinMs).toBeLessThan(d3.customerSpawnMinMs);
    expect(d7.customerPatienceMaxMs).toBeLessThan(d3.customerPatienceMaxMs);
    expect(d7.maxCustomersPerDay).toBeGreaterThan(d3.maxCustomersPerDay);
  });

  it("caps difficulty at a reasonable floor", () => {
    const d = difficultyForDay(100);
    // Spawn interval shouldn't go below 3s
    expect(d.customerSpawnMinMs).toBeGreaterThanOrEqual(3_000);
    // Patience shouldn't go below 15s
    expect(d.customerPatienceMinMs).toBeGreaterThanOrEqual(15_000);
    // Max customers caps at 30
    expect(d.maxCustomersPerDay).toBeLessThanOrEqual(30);
  });

  it("spawn min is always less than spawn max", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (day) => {
        const d = difficultyForDay(day);
        return d.customerSpawnMinMs < d.customerSpawnMaxMs;
      })
    );
  });

  it("patience min is always less than patience max", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (day) => {
        const d = difficultyForDay(day);
        return d.customerPatienceMinMs < d.customerPatienceMaxMs;
      })
    );
  });

  it("difficulty monotonically increases (spawn gets faster)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (day) => {
        const d1 = difficultyForDay(day);
        const d2 = difficultyForDay(day + 1);
        return d2.customerSpawnMinMs <= d1.customerSpawnMinMs;
      })
    );
  });

  it("all values are positive", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (day) => {
        const d = difficultyForDay(day);
        return (
          d.customerSpawnMinMs > 0 &&
          d.customerSpawnMaxMs > 0 &&
          d.customerPatienceMinMs > 0 &&
          d.customerPatienceMaxMs > 0 &&
          d.maxCustomersPerDay > 0
        );
      })
    );
  });
});
