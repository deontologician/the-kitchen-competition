import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createWallet, addCoins, spendCoins, canAfford } from "../wallet";
import { createInventory, addItem, countItem, removeItems, removeExpired } from "../inventory";
import { itemId } from "../branded";
import { timerColor, freshnessLevel, patienceLevel } from "../view/format";
import { createDayCycle, tickTimer, timerFraction, isTimedPhase } from "../day-cycle";
import { difficultyForDay } from "../difficulty";
import { unlockedDishIdsFor } from "../menu";
import { createLeaderboard, recordDayResult } from "../leaderboard";
import type { RestaurantType } from "../restaurant-type";

const TYPES: ReadonlyArray<RestaurantType> = ["burger", "bbq", "sushi"];

// ---------------------------------------------------------------------------
// 1. Wallet additive monoid
// ---------------------------------------------------------------------------
describe("wallet monoid", () => {
  it("addCoins(w, 0) is identity", () => {
    fc.assert(
      fc.property(fc.nat(1000), (coins) => {
        const w = createWallet(coins);
        expect(addCoins(w, 0).coins).toBe(w.coins);
      })
    );
  });

  it("addCoins is associative: addCoins(addCoins(w, a), b) ≡ addCoins(w, a + b)", () => {
    fc.assert(
      fc.property(
        fc.nat(1000),
        fc.nat(500),
        fc.nat(500),
        (coins, a, b) => {
          const w = createWallet(coins);
          expect(addCoins(addCoins(w, a), b).coins).toBe(
            addCoins(w, a + b).coins
          );
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Inventory add/count consistency
// ---------------------------------------------------------------------------
describe("inventory add/count", () => {
  it("adding an item increments count by 1", () => {
    fc.assert(
      fc.property(
        fc.nat(10),
        fc.nat(100_000),
        (n, timestamp) => {
          const id = itemId("test-item");
          let inv = createInventory();
          Array.from({ length: n }).forEach((_, i) => {
            inv = addItem(inv, id, timestamp + i);
          });
          const before = countItem(inv, id);
          inv = addItem(inv, id, timestamp + n);
          expect(countItem(inv, id)).toBe(before + 1);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Inventory remove/count consistency
// ---------------------------------------------------------------------------
describe("inventory remove/count", () => {
  it("removing n items decrements count by n", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        fc.nat(100_000),
        (total, toRemove, timestamp) => {
          const n = Math.min(toRemove, total);
          const id = itemId("test-item");
          let inv = createInventory();
          Array.from({ length: total }).forEach((_, i) => {
            inv = addItem(inv, id, timestamp + i);
          });
          const result = removeItems(inv, id, n);
          expect(result).toBeDefined();
          expect(countItem(result!, id)).toBe(total - n);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 4. removeExpired idempotence
// ---------------------------------------------------------------------------
describe("removeExpired idempotence", () => {
  it("applying removeExpired twice equals applying it once", () => {
    fc.assert(
      fc.property(fc.nat(200_000), (now) => {
        // Build inventory with items that have known shelf lives
        const id = itemId("sliced-tomato"); // 30s shelf life
        let inv = createInventory();
        // Add some items at various times
        inv = addItem(inv, id, 0);
        inv = addItem(inv, id, now);
        inv = addItem(inv, id, Math.floor(now / 2));

        const once = removeExpired(inv, now);
        const twice = removeExpired(once, now);
        expect(twice.items).toEqual(once.items);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Timer fraction monotonicity
// ---------------------------------------------------------------------------
describe("timer fraction monotonicity", () => {
  it("ticking decreases or maintains fraction for timed phases", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 5_000 }),
        (day, delta) => {
          const cycle = createDayCycle(day);
          const before = timerFraction(cycle.phase);
          const after = tickTimer(cycle, delta);
          if (isTimedPhase(after.phase)) {
            expect(timerFraction(after.phase)).toBeLessThanOrEqual(before);
          }
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Difficulty monotonicity
// ---------------------------------------------------------------------------
describe("difficulty monotonicity", () => {
  it("spawn intervals only decrease or stay same with higher days", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (day) => {
        const current = difficultyForDay(day);
        const next = difficultyForDay(day + 1);
        expect(next.customerSpawnMaxMs).toBeLessThanOrEqual(
          current.customerSpawnMaxMs
        );
        expect(next.customerSpawnMinMs).toBeLessThanOrEqual(
          current.customerSpawnMinMs
        );
      })
    );
  });

  it("max customers only increase or stay same with higher days", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (day) => {
        const current = difficultyForDay(day);
        const next = difficultyForDay(day + 1);
        expect(next.maxCustomersPerDay).toBeGreaterThanOrEqual(
          current.maxCustomersPerDay
        );
      })
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Menu prefix property
// ---------------------------------------------------------------------------
describe("menu prefix property", () => {
  it("unlockedDishIdsFor(type, n) is a prefix of unlockedDishIdsFor(type, n+1)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TYPES),
        fc.integer({ min: 1, max: 4 }),
        (type, n) => {
          const smaller = unlockedDishIdsFor(type, n);
          const larger = unlockedDishIdsFor(type, n + 1);
          smaller.forEach((id, i) => {
            expect(larger[i]).toBe(id);
          });
          expect(larger.length).toBeGreaterThanOrEqual(smaller.length);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Leaderboard max invariant
// ---------------------------------------------------------------------------
describe("leaderboard max invariant", () => {
  it("after recordDayResult, bestDayServed >= result.served", () => {
    fc.assert(
      fc.property(
        fc.nat(100),
        fc.nat(500),
        fc.nat(50),
        fc.nat(200),
        (prevServed, prevEarnings, served, earnings) => {
          let lb = createLeaderboard();
          lb = recordDayResult(lb, { served: prevServed, earnings: prevEarnings });
          const updated = recordDayResult(lb, { served, earnings });
          expect(updated.bestDayServed).toBeGreaterThanOrEqual(served);
          expect(updated.bestDayEarnings).toBeGreaterThanOrEqual(earnings);
        }
      )
    );
  });

  it("totalDaysPlayed increments by 1 per recordDayResult", () => {
    fc.assert(
      fc.property(
        fc.nat(50),
        fc.nat(200),
        (served, earnings) => {
          const lb = createLeaderboard();
          const updated = recordDayResult(lb, { served, earnings });
          expect(updated.totalDaysPlayed).toBe(lb.totalDaysPlayed + 1);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// 9. classify3 boundary property
// ---------------------------------------------------------------------------
describe("classify3 boundaries", () => {
  it("timerColor, freshnessLevel, patienceLevel agree on boundaries", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (frac) => {
        const t = timerColor(frac);
        const f = freshnessLevel(frac);
        const p = patienceLevel(frac);

        // All three must agree on which bucket the fraction falls into
        if (frac > 0.5) {
          expect(t).toBe("green");
          expect(f).toBe("fresh");
          expect(p).toBe("ok");
        } else if (frac > 0.25) {
          expect(t).toBe("yellow");
          expect(f).toBe("warning");
          expect(p).toBe("warning");
        } else {
          expect(t).toBe("red");
          expect(f).toBe("critical");
          expect(p).toBe("critical");
        }
      })
    );
  });

  it("exact boundary 0.5 is mid bucket", () => {
    expect(timerColor(0.5)).toBe("yellow");
    expect(freshnessLevel(0.5)).toBe("warning");
    expect(patienceLevel(0.5)).toBe("warning");
  });

  it("exact boundary 0.25 is low bucket", () => {
    expect(timerColor(0.25)).toBe("red");
    expect(freshnessLevel(0.25)).toBe("critical");
    expect(patienceLevel(0.25)).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// 10. Wallet spend/afford consistency
// ---------------------------------------------------------------------------
describe("wallet spend/afford consistency", () => {
  it("spendCoins returns undefined iff !canAfford", () => {
    fc.assert(
      fc.property(
        fc.nat(100),
        fc.nat(200),
        (coins, cost) => {
          const w = createWallet(coins);
          const spent = spendCoins(w, cost);
          const affordable = canAfford(w, cost);
          if (affordable) {
            expect(spent).toBeDefined();
            expect(spent!.coins).toBe(coins - cost);
          } else {
            expect(spent).toBeUndefined();
          }
        }
      )
    );
  });
});
