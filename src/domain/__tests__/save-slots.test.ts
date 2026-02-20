import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createSaveSlot,
  createSaveStore,
  addSlot,
  updateSlot,
  removeSlot,
  findSlot,
  findMostRecent,
  serializeStore,
  deserializeStore,
  loadStore,
  sceneDisplayName,
  restaurantDisplayName,
  formatSlotSummary,
  type SaveSlot,
  type SaveStore,
  type RestaurantType,
} from "../save-slots";

const makeSlot = (overrides: Partial<SaveSlot> = {}): SaveSlot =>
  createSaveSlot(
    overrides.id ?? "slot-1",
    overrides.restaurantType ?? "burger",
    overrides.day ?? 1,
    overrides.coins ?? 10,
    overrides.scene ?? "GroceryScene",
    overrides.lastSaved ?? 1000
  );

// --- createSaveSlot ---

describe("createSaveSlot", () => {
  it("constructs a slot with all fields", () => {
    const slot = createSaveSlot("abc", "sushi", 3, 42, "KitchenScene", 9999);
    expect(slot).toEqual({
      id: "abc",
      restaurantType: "sushi",
      day: 3,
      coins: 42,
      scene: "KitchenScene",
      lastSaved: 9999,
    });
  });
});

// --- createSaveStore ---

describe("createSaveStore", () => {
  it("creates an empty v2 store", () => {
    const store = createSaveStore();
    expect(store.version).toBe(2);
    expect(store.slots).toEqual([]);
  });
});

// --- addSlot ---

describe("addSlot", () => {
  it("appends a slot to an empty store", () => {
    const store = addSlot(createSaveStore(), makeSlot());
    expect(store.slots).toHaveLength(1);
    expect(store.slots[0].id).toBe("slot-1");
  });

  it("appends a slot to a non-empty store", () => {
    const store = addSlot(
      addSlot(createSaveStore(), makeSlot({ id: "a" })),
      makeSlot({ id: "b" })
    );
    expect(store.slots).toHaveLength(2);
    expect(store.slots[0].id).toBe("a");
    expect(store.slots[1].id).toBe("b");
  });

  it("preserves version", () => {
    const store = addSlot(createSaveStore(), makeSlot());
    expect(store.version).toBe(2);
  });
});

// --- updateSlot ---

describe("updateSlot", () => {
  it("replaces a slot by matching id", () => {
    const original = makeSlot({ id: "x", coins: 10 });
    const updated = makeSlot({ id: "x", coins: 99 });
    const store = updateSlot(addSlot(createSaveStore(), original), updated);
    expect(store.slots[0].coins).toBe(99);
  });

  it("does not change other slots", () => {
    const a = makeSlot({ id: "a", coins: 5 });
    const b = makeSlot({ id: "b", coins: 10 });
    const store = addSlot(addSlot(createSaveStore(), a), b);
    const updatedB = makeSlot({ id: "b", coins: 20 });
    const result = updateSlot(store, updatedB);
    expect(result.slots[0].coins).toBe(5);
    expect(result.slots[1].coins).toBe(20);
  });

  it("returns unchanged store if id not found", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "a" }));
    const result = updateSlot(store, makeSlot({ id: "z" }));
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("a");
  });
});

// --- removeSlot ---

describe("removeSlot", () => {
  it("removes a slot by id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "a" }));
    const result = removeSlot(store, "a");
    expect(result.slots).toHaveLength(0);
  });

  it("does not remove other slots", () => {
    const store = addSlot(
      addSlot(createSaveStore(), makeSlot({ id: "a" })),
      makeSlot({ id: "b" })
    );
    const result = removeSlot(store, "a");
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("b");
  });

  it("returns unchanged store if id not found", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "a" }));
    const result = removeSlot(store, "z");
    expect(result.slots).toHaveLength(1);
  });
});

// --- findSlot ---

describe("findSlot", () => {
  it("finds a slot by id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "abc" }));
    expect(findSlot(store, "abc")).toBeDefined();
    expect(findSlot(store, "abc")!.id).toBe("abc");
  });

  it("returns undefined for unknown id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "abc" }));
    expect(findSlot(store, "xyz")).toBeUndefined();
  });

  it("returns undefined for empty store", () => {
    expect(findSlot(createSaveStore(), "any")).toBeUndefined();
  });
});

// --- findMostRecent ---

describe("findMostRecent", () => {
  it("returns undefined for empty store", () => {
    expect(findMostRecent(createSaveStore())).toBeUndefined();
  });

  it("returns the only slot for single-slot store", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "only" }));
    expect(findMostRecent(store)!.id).toBe("only");
  });

  it("returns the slot with the highest lastSaved", () => {
    const store = addSlot(
      addSlot(
        addSlot(createSaveStore(), makeSlot({ id: "old", lastSaved: 100 })),
        makeSlot({ id: "newest", lastSaved: 9999 })
      ),
      makeSlot({ id: "middle", lastSaved: 5000 })
    );
    expect(findMostRecent(store)!.id).toBe("newest");
  });
});

// --- serializeStore / deserializeStore ---

describe("serializeStore", () => {
  it("produces valid JSON", () => {
    const store = addSlot(createSaveStore(), makeSlot());
    expect(() => JSON.parse(serializeStore(store))).not.toThrow();
  });
});

describe("deserializeStore", () => {
  it("roundtrips through serialize", () => {
    const store = addSlot(createSaveStore(), makeSlot());
    const result = deserializeStore(serializeStore(store));
    expect(result).toEqual(store);
  });

  it("returns undefined for empty string", () => {
    expect(deserializeStore("")).toBeUndefined();
  });

  it("returns undefined for invalid JSON", () => {
    expect(deserializeStore("{bad")).toBeUndefined();
  });

  it("returns undefined for wrong version", () => {
    expect(
      deserializeStore(JSON.stringify({ version: 1, slots: [] }))
    ).toBeUndefined();
  });

  it("returns undefined for missing slots", () => {
    expect(deserializeStore(JSON.stringify({ version: 2 }))).toBeUndefined();
  });

  it("returns undefined for non-array slots", () => {
    expect(
      deserializeStore(JSON.stringify({ version: 2, slots: "nope" }))
    ).toBeUndefined();
  });

  it("returns undefined if a slot has invalid restaurantType", () => {
    const bad = {
      version: 2,
      slots: [
        {
          id: "x",
          restaurantType: "pizza",
          day: 1,
          coins: 10,
          scene: "GroceryScene",
          lastSaved: 1000,
        },
      ],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("returns undefined if a slot has non-positive day", () => {
    const bad = {
      version: 2,
      slots: [
        {
          id: "x",
          restaurantType: "burger",
          day: 0,
          coins: 10,
          scene: "GroceryScene",
          lastSaved: 1000,
        },
      ],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("returns undefined if a slot has negative coins", () => {
    const bad = {
      version: 2,
      slots: [
        {
          id: "x",
          restaurantType: "burger",
          day: 1,
          coins: -5,
          scene: "GroceryScene",
          lastSaved: 1000,
        },
      ],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("returns undefined if a slot is missing required fields", () => {
    const bad = {
      version: 2,
      slots: [{ id: "x" }],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("returns undefined if a slot id is not a string", () => {
    const bad = {
      version: 2,
      slots: [
        {
          id: 123,
          restaurantType: "burger",
          day: 1,
          coins: 10,
          scene: "GroceryScene",
          lastSaved: 1000,
        },
      ],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("returns undefined if scene is not a string", () => {
    const bad = {
      version: 2,
      slots: [
        {
          id: "x",
          restaurantType: "burger",
          day: 1,
          coins: 10,
          scene: 42,
          lastSaved: 1000,
        },
      ],
    };
    expect(deserializeStore(JSON.stringify(bad))).toBeUndefined();
  });

  it("accepts a store with multiple valid slots", () => {
    const store = addSlot(
      addSlot(createSaveStore(), makeSlot({ id: "a" })),
      makeSlot({ id: "b", restaurantType: "sushi" })
    );
    const result = deserializeStore(serializeStore(store));
    expect(result).toEqual(store);
  });
});

// --- loadStore ---

describe("loadStore", () => {
  it("returns parsed v2 store from valid JSON", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: "existing" }));
    const result = loadStore(
      serializeStore(store),
      "migration-id",
      Date.now()
    );
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("existing");
  });

  it("migrates v1 save data to a single-slot v2 store", () => {
    const v1 = JSON.stringify({ version: 1, coins: 42 });
    const result = loadStore(v1, "migrated-id", 5000);
    expect(result.version).toBe(2);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("migrated-id");
    expect(result.slots[0].coins).toBe(42);
    expect(result.slots[0].restaurantType).toBe("burger");
    expect(result.slots[0].day).toBe(1);
    expect(result.slots[0].scene).toBe("GroceryScene");
    expect(result.slots[0].lastSaved).toBe(5000);
  });

  it("returns empty store for null input", () => {
    const result = loadStore(null, "id", Date.now());
    expect(result.slots).toHaveLength(0);
  });

  it("returns empty store for invalid JSON", () => {
    const result = loadStore("{garbage", "id", Date.now());
    expect(result.slots).toHaveLength(0);
  });

  it("returns empty store for unrecognized valid JSON", () => {
    const result = loadStore(JSON.stringify({ foo: "bar" }), "id", Date.now());
    expect(result.slots).toHaveLength(0);
  });
});

// --- sceneDisplayName ---

describe("sceneDisplayName", () => {
  it("maps GroceryScene", () => {
    expect(sceneDisplayName("GroceryScene")).toBe("Grocery Store");
  });

  it("maps KitchenScene", () => {
    expect(sceneDisplayName("KitchenScene")).toBe("Kitchen");
  });

  it("maps RestaurantScene", () => {
    expect(sceneDisplayName("RestaurantScene")).toBe("Restaurant");
  });

  it("maps TitleScene", () => {
    expect(sceneDisplayName("TitleScene")).toBe("Title");
  });

  it("returns the key for unknown scenes", () => {
    expect(sceneDisplayName("UnknownScene")).toBe("UnknownScene");
  });
});

// --- restaurantDisplayName ---

describe("restaurantDisplayName", () => {
  it("maps sushi", () => {
    expect(restaurantDisplayName("sushi")).toBe("Sushi");
  });

  it("maps bbq", () => {
    expect(restaurantDisplayName("bbq")).toBe("BBQ");
  });

  it("maps burger", () => {
    expect(restaurantDisplayName("burger")).toBe("Burger Joint");
  });
});

// --- formatSlotSummary ---

describe("formatSlotSummary", () => {
  it("formats a slot as Day N - Type - $Coins", () => {
    const slot = makeSlot({ day: 3, restaurantType: "sushi", coins: 42 });
    expect(formatSlotSummary(slot)).toBe("Day 3 - Sushi - $42");
  });

  it("formats a burger slot", () => {
    const slot = makeSlot({ day: 1, restaurantType: "burger", coins: 10 });
    expect(formatSlotSummary(slot)).toBe("Day 1 - Burger Joint - $10");
  });

  it("formats a bbq slot", () => {
    const slot = makeSlot({ day: 7, restaurantType: "bbq", coins: 100 });
    expect(formatSlotSummary(slot)).toBe("Day 7 - BBQ - $100");
  });
});

// --- Property-based tests ---

describe("property-based tests", () => {
  const restaurantTypeArb = fc.constantFrom(
    "sushi" as const,
    "bbq" as const,
    "burger" as const
  );

  const slotArb = fc
    .record({
      id: fc.uuid(),
      restaurantType: restaurantTypeArb,
      day: fc.integer({ min: 1, max: 999 }),
      coins: fc.nat(99999),
      scene: fc.constantFrom(
        "GroceryScene",
        "KitchenScene",
        "RestaurantScene"
      ),
      lastSaved: fc.nat(Number.MAX_SAFE_INTEGER),
    })
    .map((r) =>
      createSaveSlot(r.id, r.restaurantType, r.day, r.coins, r.scene, r.lastSaved)
    );

  it("serialize/deserialize roundtrips for any valid store", () => {
    fc.assert(
      fc.property(fc.array(slotArb, { maxLength: 10 }), (slots) => {
        const store = slots.reduce(
          (s, slot) => addSlot(s, slot),
          createSaveStore()
        );
        const result = deserializeStore(serializeStore(store));
        expect(result).toEqual(store);
      })
    );
  });

  it("addSlot increases slot count by 1", () => {
    fc.assert(
      fc.property(
        fc.array(slotArb, { maxLength: 10 }),
        slotArb,
        (existing, newSlot) => {
          const store = existing.reduce(
            (s, slot) => addSlot(s, slot),
            createSaveStore()
          );
          const result = addSlot(store, newSlot);
          expect(result.slots.length).toBe(store.slots.length + 1);
        }
      )
    );
  });

  it("removeSlot + findSlot returns undefined", () => {
    fc.assert(
      fc.property(slotArb, (slot) => {
        const store = addSlot(createSaveStore(), slot);
        const removed = removeSlot(store, slot.id);
        expect(findSlot(removed, slot.id)).toBeUndefined();
      })
    );
  });

  it("findMostRecent returns slot with highest lastSaved", () => {
    fc.assert(
      fc.property(
        fc.array(slotArb, { minLength: 1, maxLength: 10 }),
        (slots) => {
          const store = slots.reduce(
            (s, slot) => addSlot(s, slot),
            createSaveStore()
          );
          const most = findMostRecent(store)!;
          const maxTimestamp = Math.max(...slots.map((s) => s.lastSaved));
          expect(most.lastSaved).toBe(maxTimestamp);
        }
      )
    );
  });
});
