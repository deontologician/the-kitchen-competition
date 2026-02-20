import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createSaveData,
  serializeSave,
  deserializeSave,
  saveDataToWallet,
  SAVE_KEY,
} from "../save-game";
import { createWallet } from "../wallet";

describe("createSaveData", () => {
  it("captures wallet coins and version", () => {
    const wallet = createWallet(42);
    const data = createSaveData(wallet);
    expect(data.version).toBe(1);
    expect(data.coins).toBe(42);
  });
});

describe("serializeSave", () => {
  it("produces valid JSON", () => {
    const data = createSaveData(createWallet(10));
    const json = serializeSave(data);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("deserializeSave", () => {
  it("roundtrips through serialize", () => {
    const data = createSaveData(createWallet(25));
    const result = deserializeSave(serializeSave(data));
    expect(result).toEqual(data);
  });

  it("returns undefined for empty string", () => {
    expect(deserializeSave("")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(deserializeSave("{bad json")).toBeUndefined();
  });

  it("returns undefined for missing version", () => {
    expect(deserializeSave(JSON.stringify({ coins: 10 }))).toBeUndefined();
  });

  it("returns undefined for wrong version type", () => {
    expect(
      deserializeSave(JSON.stringify({ version: "1", coins: 10 }))
    ).toBeUndefined();
  });

  it("returns undefined for missing coins", () => {
    expect(deserializeSave(JSON.stringify({ version: 1 }))).toBeUndefined();
  });

  it("returns undefined for non-number coins", () => {
    expect(
      deserializeSave(JSON.stringify({ version: 1, coins: "ten" }))
    ).toBeUndefined();
  });

  it("returns undefined for negative coins", () => {
    expect(
      deserializeSave(JSON.stringify({ version: 1, coins: -5 }))
    ).toBeUndefined();
  });

  it("returns undefined for non-integer coins", () => {
    expect(
      deserializeSave(JSON.stringify({ version: 1, coins: 3.5 }))
    ).toBeUndefined();
  });

  it("ignores extra fields", () => {
    const json = JSON.stringify({ version: 1, coins: 10, extra: "stuff" });
    const result = deserializeSave(json);
    expect(result).toBeDefined();
    expect(result!.coins).toBe(10);
  });
});

describe("saveDataToWallet", () => {
  it("converts save data to a wallet", () => {
    const data = createSaveData(createWallet(15));
    const wallet = saveDataToWallet(data);
    expect(wallet.coins).toBe(15);
  });
});

describe("SAVE_KEY", () => {
  it("is a non-empty string", () => {
    expect(SAVE_KEY.length).toBeGreaterThan(0);
  });
});

describe("property-based tests", () => {
  it("serialize/deserialize roundtrips for any valid coin count", () => {
    fc.assert(
      fc.property(fc.nat(10000), (coins) => {
        const data = createSaveData(createWallet(coins));
        const result = deserializeSave(serializeSave(data));
        expect(result).toEqual(data);
      })
    );
  });

  it("saveDataToWallet preserves coin count from createSaveData", () => {
    fc.assert(
      fc.property(fc.nat(10000), (coins) => {
        const wallet = createWallet(coins);
        const restored = saveDataToWallet(createSaveData(wallet));
        expect(restored.coins).toBe(wallet.coins);
      })
    );
  });

  it("deserializeSave rejects arbitrary strings", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try {
            const parsed = JSON.parse(s);
            return (
              typeof parsed !== "object" ||
              parsed === null ||
              parsed.version !== 1 ||
              typeof parsed.coins !== "number" ||
              !Number.isInteger(parsed.coins) ||
              parsed.coins < 0
            );
          } catch {
            return true;
          }
        }),
        (s) => {
          expect(deserializeSave(s)).toBeUndefined();
        }
      )
    );
  });
});
