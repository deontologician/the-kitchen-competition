import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createWallet,
  initialWallet,
  addCoins,
  spendCoins,
  canAfford,
  formatCoins,
} from "../wallet";

describe("createWallet", () => {
  it("creates a wallet with the given coin count", () => {
    expect(createWallet(10).coins).toBe(10);
  });

  it("floors fractional amounts", () => {
    expect(createWallet(5.7).coins).toBe(5);
  });

  it("clamps negative values to 0", () => {
    expect(createWallet(-3).coins).toBe(0);
  });
});

describe("initialWallet", () => {
  it("starts with 10 coins", () => {
    expect(initialWallet.coins).toBe(10);
  });
});

describe("addCoins", () => {
  it("increases the coin count", () => {
    const wallet = createWallet(5);
    expect(addCoins(wallet, 3).coins).toBe(8);
  });

  it("returns a new wallet (immutable)", () => {
    const wallet = createWallet(5);
    const updated = addCoins(wallet, 3);
    expect(updated).not.toBe(wallet);
    expect(wallet.coins).toBe(5);
  });
});

describe("spendCoins", () => {
  it("decreases the coin count", () => {
    const wallet = createWallet(10);
    const result = spendCoins(wallet, 3);
    expect(result).toBeDefined();
    expect(result!.coins).toBe(7);
  });

  it("returns undefined when cannot afford", () => {
    const wallet = createWallet(2);
    expect(spendCoins(wallet, 5)).toBeUndefined();
  });

  it("allows spending exact balance", () => {
    const wallet = createWallet(5);
    const result = spendCoins(wallet, 5);
    expect(result).toBeDefined();
    expect(result!.coins).toBe(0);
  });
});

describe("canAfford", () => {
  it("returns true when coins are sufficient", () => {
    expect(canAfford(createWallet(10), 5)).toBe(true);
  });

  it("returns true for exact amount", () => {
    expect(canAfford(createWallet(5), 5)).toBe(true);
  });

  it("returns false when coins are insufficient", () => {
    expect(canAfford(createWallet(3), 5)).toBe(false);
  });
});

describe("formatCoins", () => {
  it("returns coin icon followed by count", () => {
    expect(formatCoins(createWallet(10))).toBe("$10");
  });

  it("formats zero coins", () => {
    expect(formatCoins(createWallet(0))).toBe("$0");
  });

  it("formats large numbers", () => {
    expect(formatCoins(createWallet(999))).toBe("$999");
  });
});

describe("property-based tests", () => {
  it("coins are always a non-negative integer after createWallet", () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 1000 }), (n) => {
        const wallet = createWallet(n);
        expect(wallet.coins).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(wallet.coins)).toBe(true);
      })
    );
  });

  it("spendCoins never produces negative — returns undefined instead", () => {
    fc.assert(
      fc.property(
        fc.nat(1000),
        fc.nat(1000),
        (coins, cost) => {
          const wallet = createWallet(coins);
          const result = spendCoins(wallet, cost);
          if (result !== undefined) {
            expect(result.coins).toBeGreaterThanOrEqual(0);
          }
        }
      )
    );
  });

  it("canAfford agrees with spendCoins result", () => {
    fc.assert(
      fc.property(
        fc.nat(1000),
        fc.nat(1000),
        (coins, cost) => {
          const wallet = createWallet(coins);
          expect(canAfford(wallet, cost)).toBe(spendCoins(wallet, cost) !== undefined);
        }
      )
    );
  });

  it("addCoins then spendCoins roundtrips", () => {
    fc.assert(
      fc.property(
        fc.nat(500),
        fc.nat(500),
        (initial, amount) => {
          const wallet = createWallet(initial);
          const added = addCoins(wallet, amount);
          const result = spendCoins(added, amount);
          expect(result).toBeDefined();
          expect(result!.coins).toBe(initial);
        }
      )
    );
  });
});
