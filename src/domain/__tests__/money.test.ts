import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createMoney,
  fromDollars,
  addMoney,
  subtractMoney,
  isNegative,
  toDollars,
  zero,
} from "../money";

describe("Money", () => {
  describe("createMoney", () => {
    it("stores cents as an integer", () => {
      expect(createMoney(150).cents).toBe(150);
    });

    it("rounds fractional cents", () => {
      expect(createMoney(10.6).cents).toBe(11);
      expect(createMoney(10.4).cents).toBe(10);
    });
  });

  describe("fromDollars", () => {
    it("converts dollars to cents", () => {
      expect(fromDollars(1.5).cents).toBe(150);
    });
  });

  describe("addMoney", () => {
    it("adds two money values", () => {
      const result = addMoney(createMoney(100), createMoney(250));
      expect(result.cents).toBe(350);
    });

    it("is commutative (property)", () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          const ma = createMoney(a);
          const mb = createMoney(b);
          expect(addMoney(ma, mb).cents).toBe(addMoney(mb, ma).cents);
        }),
      );
    });

    it("has zero as identity (property)", () => {
      fc.assert(
        fc.property(fc.integer(), (a) => {
          const ma = createMoney(a);
          expect(addMoney(ma, zero).cents).toBe(ma.cents);
        }),
      );
    });
  });

  describe("subtractMoney", () => {
    it("subtracts second from first", () => {
      const result = subtractMoney(createMoney(500), createMoney(200));
      expect(result.cents).toBe(300);
    });

    it("can produce negative values", () => {
      const result = subtractMoney(createMoney(100), createMoney(200));
      expect(result.cents).toBe(-100);
      expect(isNegative(result)).toBe(true);
    });
  });

  describe("toDollars", () => {
    it("converts cents back to dollars", () => {
      expect(toDollars(createMoney(350))).toBe(3.5);
    });

    it("roundtrips through fromDollars (property)", () => {
      fc.assert(
        fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }), (cents) => {
          const dollars = toDollars(createMoney(cents));
          expect(fromDollars(dollars).cents).toBe(cents);
        }),
      );
    });
  });

  describe("isNegative", () => {
    it("returns false for zero", () => {
      expect(isNegative(zero)).toBe(false);
    });

    it("returns false for positive", () => {
      expect(isNegative(createMoney(1))).toBe(false);
    });

    it("returns true for negative", () => {
      expect(isNegative(createMoney(-1))).toBe(true);
    });
  });
});
