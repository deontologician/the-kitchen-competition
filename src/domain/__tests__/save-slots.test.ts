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
  toggleDish,
  type SaveSlot,
  type SaveStore,
  type RestaurantType,
} from "../save-slots";
import { slotId, itemId } from "../branded";

const makeSlot = (overrides: Partial<SaveSlot> = {}): SaveSlot =>
  createSaveSlot(
    overrides.id ?? slotId("slot-1"),
    overrides.restaurantType ?? "burger",
    overrides.day ?? 1,
    overrides.coins ?? 10,
    overrides.scene ?? "GroceryScene",
    overrides.lastSaved ?? 1000,
    overrides.unlockedDishes
  );

// --- createSaveSlot ---

describe("createSaveSlot", () => {
  it("constructs a slot with all fields", () => {
    const slot = createSaveSlot(slotId("abc"), "sushi", 3, 42, "KitchenScene", 9999, 3);
    expect(slot).toEqual({
      id: "abc",
      restaurantType: "sushi",
      day: 3,
      coins: 42,
      scene: "KitchenScene",
      lastSaved: 9999,
      unlockedDishes: 3,
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
      addSlot(createSaveStore(), makeSlot({ id: slotId("a") })),
      makeSlot({ id: slotId("b") })
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
    const original = makeSlot({ id: slotId("x"), coins: 10 });
    const updated = makeSlot({ id: slotId("x"), coins: 99 });
    const store = updateSlot(addSlot(createSaveStore(), original), updated);
    expect(store.slots[0].coins).toBe(99);
  });

  it("does not change other slots", () => {
    const a = makeSlot({ id: slotId("a"), coins: 5 });
    const b = makeSlot({ id: slotId("b"), coins: 10 });
    const store = addSlot(addSlot(createSaveStore(), a), b);
    const updatedB = makeSlot({ id: slotId("b"), coins: 20 });
    const result = updateSlot(store, updatedB);
    expect(result.slots[0].coins).toBe(5);
    expect(result.slots[1].coins).toBe(20);
  });

  it("returns unchanged store if id not found", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("a") }));
    const result = updateSlot(store, makeSlot({ id: slotId("z") }));
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("a");
  });
});

// --- removeSlot ---

describe("removeSlot", () => {
  it("removes a slot by id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("a") }));
    const result = removeSlot(store, slotId("a"));
    expect(result.slots).toHaveLength(0);
  });

  it("does not remove other slots", () => {
    const store = addSlot(
      addSlot(createSaveStore(), makeSlot({ id: slotId("a") })),
      makeSlot({ id: slotId("b") })
    );
    const result = removeSlot(store, slotId("a"));
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("b");
  });

  it("returns unchanged store if id not found", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("a") }));
    const result = removeSlot(store, slotId("z"));
    expect(result.slots).toHaveLength(1);
  });
});

// --- findSlot ---

describe("findSlot", () => {
  it("finds a slot by id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("abc") }));
    expect(findSlot(store, slotId("abc"))).toBeDefined();
    expect(findSlot(store, slotId("abc"))!.id).toBe("abc");
  });

  it("returns undefined for unknown id", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("abc") }));
    expect(findSlot(store, slotId("xyz"))).toBeUndefined();
  });

  it("returns undefined for empty store", () => {
    expect(findSlot(createSaveStore(), slotId("any"))).toBeUndefined();
  });
});

// --- findMostRecent ---

describe("findMostRecent", () => {
  it("returns undefined for empty store", () => {
    expect(findMostRecent(createSaveStore())).toBeUndefined();
  });

  it("returns the only slot for single-slot store", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("only") }));
    expect(findMostRecent(store)!.id).toBe("only");
  });

  it("returns the slot with the highest lastSaved", () => {
    const store = addSlot(
      addSlot(
        addSlot(createSaveStore(), makeSlot({ id: slotId("old"), lastSaved: 100 })),
        makeSlot({ id: slotId("newest"), lastSaved: 9999 })
      ),
      makeSlot({ id: slotId("middle"), lastSaved: 5000 })
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
      addSlot(createSaveStore(), makeSlot({ id: slotId("a") })),
      makeSlot({ id: slotId("b"), restaurantType: "sushi" })
    );
    const result = deserializeStore(serializeStore(store));
    expect(result).toEqual(store);
  });
});

// --- loadStore ---

describe("loadStore", () => {
  it("returns parsed v2 store from valid JSON", () => {
    const store = addSlot(createSaveStore(), makeSlot({ id: slotId("existing") }));
    const result = loadStore(
      serializeStore(store),
      slotId("migration-id"),
      Date.now()
    );
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe("existing");
  });

  it("migrates v1 save data to a single-slot v2 store", () => {
    const v1 = JSON.stringify({ version: 1, coins: 42 });
    const result = loadStore(v1, slotId("migrated-id"), 5000);
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
    const result = loadStore(null, slotId("id"), Date.now());
    expect(result.slots).toHaveLength(0);
  });

  it("returns empty store for invalid JSON", () => {
    const result = loadStore("{garbage", slotId("id"), Date.now());
    expect(result.slots).toHaveLength(0);
  });

  it("returns empty store for unrecognized valid JSON", () => {
    const result = loadStore(JSON.stringify({ foo: "bar" }), slotId("id"), Date.now());
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

// --- unlockedDishes ---

describe("unlockedDishes", () => {
  it("createSaveSlot stores unlockedDishes", () => {
    const slot = createSaveSlot(slotId("abc"), "sushi", 3, 42, "KitchenScene", 9999, 3);
    expect(slot.unlockedDishes).toBe(3);
  });

  it("createSaveSlot defaults unlockedDishes to 5 when omitted", () => {
    const slot = createSaveSlot(slotId("abc"), "sushi", 3, 42, "KitchenScene", 9999);
    expect(slot.unlockedDishes).toBe(5);
  });

  it("roundtrips through serialize/deserialize", () => {
    const slot = createSaveSlot(slotId("abc"), "burger", 1, 10, "GroceryScene", 1000, 2);
    const store = addSlot(createSaveStore(), slot);
    const result = deserializeStore(serializeStore(store));
    expect(result).toBeDefined();
    expect(result!.slots[0].unlockedDishes).toBe(2);
  });

  it("old saves without unlockedDishes field deserialize with unlockedDishes=5", () => {
    const oldJson = JSON.stringify({
      version: 2,
      slots: [{
        id: "old-slot",
        restaurantType: "burger",
        day: 3,
        coins: 50,
        scene: "GroceryScene",
        lastSaved: 1000,
      }],
    });
    const result = deserializeStore(oldJson);
    expect(result).toBeDefined();
    expect(result!.slots[0].unlockedDishes).toBe(5);
  });

  it("v1 migration creates slot with unlockedDishes=5", () => {
    const v1 = JSON.stringify({ version: 1, coins: 42 });
    const result = loadStore(v1, slotId("migrated-id"), 5000);
    expect(result.slots[0].unlockedDishes).toBe(5);
  });
});

// --- toggleDish ---

describe("toggleDish", () => {
  const burger1 = itemId("classic-burger");
  const burger2 = itemId("cheeseburger");
  const burger3 = itemId("chicken-sandwich");
  const allThree = [burger1, burger2, burger3] as const;

  it("disables an enabled dish", () => {
    const slot = makeSlot();
    const updated = toggleDish(slot, burger2, [...allThree]);
    expect(updated.disabledDishes).toContain(burger2);
  });

  it("re-enables a disabled dish", () => {
    const slot = makeSlot();
    const withDisabled = toggleDish(slot, burger2, [...allThree]);
    const reEnabled = toggleDish(withDisabled, burger2, [burger1, burger3]);
    expect(reEnabled.disabledDishes).not.toContain(burger2);
  });

  it("cannot disable the last remaining enabled dish", () => {
    const slot = makeSlot();
    const updated = toggleDish(slot, burger1, [burger1]);
    expect(updated).toEqual(slot);
  });

  it("slot with no disabledDishes behaves as all-enabled (can disable)", () => {
    const slot = makeSlot(); // disabledDishes is undefined
    const updated = toggleDish(slot, burger2, [...allThree]);
    expect(updated.disabledDishes).toContain(burger2);
    expect(updated.disabledDishes?.length).toBe(1);
  });

  it("does not affect other fields", () => {
    const slot = makeSlot({ coins: 42, day: 7 });
    const updated = toggleDish(slot, burger2, [...allThree]);
    expect(updated.coins).toBe(42);
    expect(updated.day).toBe(7);
    expect(updated.id).toBe(slot.id);
  });

  it("toggling twice returns to original enabled state", () => {
    const slot = makeSlot();
    const disabled = toggleDish(slot, burger2, [...allThree]);
    const reEnabled = toggleDish(disabled, burger2, [burger1, burger3]);
    expect(reEnabled.disabledDishes ?? []).not.toContain(burger2);
  });

  it("disabledDishes roundtrips through serialize/deserialize", () => {
    const slot = makeSlot();
    const withDisabled = toggleDish(slot, burger2, [...allThree]);
    const store = addSlot(createSaveStore(), withDisabled);
    const result = deserializeStore(serializeStore(store));
    expect(result).toBeDefined();
    expect(result!.slots[0].disabledDishes).toContain(burger2);
  });

  it("old saves without disabledDishes deserialize with disabledDishes=[]", () => {
    const oldJson = JSON.stringify({
      version: 2,
      slots: [{
        id: "old-slot",
        restaurantType: "burger",
        day: 3,
        coins: 50,
        scene: "GroceryScene",
        lastSaved: 1000,
        unlockedDishes: 3,
      }],
    });
    const result = deserializeStore(oldJson);
    expect(result).toBeDefined();
    expect(result!.slots[0].disabledDishes ?? []).toEqual([]);
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
      unlockedDishes: fc.integer({ min: 1, max: 5 }),
    })
    .map((r) =>
      createSaveSlot(slotId(r.id), r.restaurantType, r.day, r.coins, r.scene, r.lastSaved, r.unlockedDishes)
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
