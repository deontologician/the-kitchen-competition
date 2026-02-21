import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { itemId } from "../branded";
import {
  createKitchenZoneState,
  placeItemInZone,
  activateCuttingBoardSlot,
  flipStoveSlot,
  retrieveReadyItem,
  tickKitchenZones,
  ZONE_CAPACITIES,
  type KitchenZoneState,
  type ZoneSlot,
} from "../kitchen-zones";

// ---------------------------------------------------------------------------
// createKitchenZoneState
// ---------------------------------------------------------------------------

describe("createKitchenZoneState", () => {
  it("all slots empty", () => {
    const state = createKitchenZoneState();
    state.cuttingBoard.forEach((s) => expect(s.tag).toBe("empty"));
    state.stove.forEach((s) => expect(s.tag).toBe("empty"));
    state.oven.forEach((s) => expect(s.tag).toBe("empty"));
  });

  it("capacities correct", () => {
    const state = createKitchenZoneState();
    expect(state.cuttingBoard).toHaveLength(ZONE_CAPACITIES.cuttingBoard);
    expect(state.stove).toHaveLength(ZONE_CAPACITIES.stove);
    expect(state.oven).toHaveLength(ZONE_CAPACITIES.oven);
  });

  it("ready pile is empty", () => {
    const state = createKitchenZoneState();
    expect(state.ready).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// placeItemInZone
// ---------------------------------------------------------------------------

describe("placeItemInZone", () => {
  it("places item in first empty slot of cuttingBoard", () => {
    const state = createKitchenZoneState();
    const next = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold");
    expect(next).toBeDefined();
    expect(next!.cuttingBoard[0].tag).toBe("working");
  });

  it("places item in first empty slot of stove", () => {
    const state = createKitchenZoneState();
    const next = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip");
    expect(next).toBeDefined();
    expect(next!.stove[0].tag).toBe("working");
  });

  it("returns undefined if zone is full (cuttingBoard capacity=1)", () => {
    const state = createKitchenZoneState();
    const s1 = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold");
    expect(s1).toBeDefined();
    const s2 = placeItemInZone(s1!, "cuttingBoard", itemId("sliced-tomato"), 2000, "hold");
    expect(s2).toBeUndefined();
  });

  it("returns undefined if stove is full (capacity=3)", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    state = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    state = placeItemInZone(state, "stove", itemId("french-fries"), 4000, "flip")!;
    state = placeItemInZone(state, "stove", itemId("crispy-bacon"), 4000, "flip")!;
    const result = placeItemInZone(state, "stove", itemId("grilled-corn"), 4000, "flip");
    expect(result).toBeUndefined();
  });

  it("hold interaction: isActive starts false", () => {
    const state = createKitchenZoneState();
    const next = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold");
    const slot = next!.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(false);
    }
  });

  it("flip interaction: isActive starts true", () => {
    const state = createKitchenZoneState();
    const next = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip");
    const slot = next!.stove[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(true);
    }
  });

  it("auto interaction: isActive starts true", () => {
    const state = createKitchenZoneState();
    const next = placeItemInZone(state, "oven", itemId("smoked-pork"), 8000, "auto");
    const slot = next!.oven[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(true);
    }
  });

  it("fills slots in order when multiple items placed", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    state = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    state = placeItemInZone(state, "stove", itemId("french-fries"), 4000, "flip")!;
    expect(state.stove[0].tag).toBe("working");
    expect(state.stove[1].tag).toBe("working");
    expect(state.stove[2].tag).toBe("empty");
  });
});

// ---------------------------------------------------------------------------
// activateCuttingBoardSlot
// ---------------------------------------------------------------------------

describe("activateCuttingBoardSlot", () => {
  it("sets isActive=true on working slot", () => {
    const state = createKitchenZoneState();
    const s1 = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold")!;
    const s2 = activateCuttingBoardSlot(s1, 0, true);
    const slot = s2.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(true);
    }
  });

  it("sets isActive=false on working slot", () => {
    const state = createKitchenZoneState();
    const s1 = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold")!;
    const s2 = activateCuttingBoardSlot(s1, 0, true);
    const s3 = activateCuttingBoardSlot(s2, 0, false);
    const slot = s3.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(false);
    }
  });

  it("no-op on empty slot", () => {
    const state = createKitchenZoneState();
    const result = activateCuttingBoardSlot(state, 0, true);
    expect(result.cuttingBoard[0].tag).toBe("empty");
  });

  it("no-op when slot index out of bounds", () => {
    const state = createKitchenZoneState();
    const result = activateCuttingBoardSlot(state, 5, true);
    expect(result).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// flipStoveSlot
// ---------------------------------------------------------------------------

describe("flipStoveSlot", () => {
  it("needs_flip slot transitions to working (isActive=true)", () => {
    const state = createKitchenZoneState();
    // Place a flip item and tick it to needs_flip
    let s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    s = tickKitchenZones(s, 2501); // > 50% of 5000ms
    expect(s.stove[0].tag).toBe("needs_flip");
    const flipped = flipStoveSlot(s, 0);
    expect(flipped.stove[0].tag).toBe("working");
    if (flipped.stove[0].tag === "working") {
      expect(flipped.stove[0].isActive).toBe(true);
    }
  });

  it("no-op on a working slot", () => {
    const state = createKitchenZoneState();
    const s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    const result = flipStoveSlot(s, 0);
    // Should still be working (not changed)
    expect(result.stove[0].tag).toBe("working");
    expect(result).toEqual(s);
  });

  it("no-op on empty slot", () => {
    const state = createKitchenZoneState();
    const result = flipStoveSlot(state, 0);
    expect(result).toEqual(state);
  });

  it("preserves progress after flip", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    s = tickKitchenZones(s, 2501);
    const flipped = flipStoveSlot(s, 0);
    const slot = flipped.stove[0];
    if (slot.tag === "working") {
      expect(slot.progressMs).toBe(2500); // clamped to durationMs/2
    }
  });
});

// ---------------------------------------------------------------------------
// tickKitchenZones
// ---------------------------------------------------------------------------

describe("tickKitchenZones", () => {
  it("hold slot does NOT advance when isActive=false", () => {
    const state = createKitchenZoneState();
    const s1 = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold")!;
    // isActive is false by default for hold
    const s2 = tickKitchenZones(s1, 1000);
    const slot = s2.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.progressMs).toBe(0);
    }
  });

  it("hold slot advances when isActive=true", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold")!;
    s = activateCuttingBoardSlot(s, 0, true);
    s = tickKitchenZones(s, 1000);
    const slot = s.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.progressMs).toBe(1000);
    }
  });

  it("hold slot completes → slot becomes empty + item in ready", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 2000, "hold")!;
    s = activateCuttingBoardSlot(s, 0, true);
    s = tickKitchenZones(s, 2001);
    expect(s.cuttingBoard[0].tag).toBe("empty");
    expect(s.ready).toContain(itemId("shredded-lettuce"));
  });

  it("flip slot pauses at 50% → needs_flip", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    s = tickKitchenZones(s, 2500);
    expect(s.stove[0].tag).toBe("needs_flip");
  });

  it("flip slot does NOT advance past 50% without flip", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    s = tickKitchenZones(s, 2600);
    expect(s.stove[0].tag).toBe("needs_flip");
    const stillPaused = tickKitchenZones(s, 5000); // lots more time
    expect(stillPaused.stove[0].tag).toBe("needs_flip");
  });

  it("flip slot completes after flip + more ticking", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    s = tickKitchenZones(s, 2500); // → needs_flip
    s = flipStoveSlot(s, 0); // → working again
    s = tickKitchenZones(s, 2501); // complete
    expect(s.stove[0].tag).toBe("empty");
    expect(s.ready).toContain(itemId("grilled-patty"));
  });

  it("auto slot always advances", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "oven", itemId("smoked-pork"), 8000, "auto")!;
    s = tickKitchenZones(s, 3000);
    const slot = s.oven[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.progressMs).toBe(3000);
    }
  });

  it("multiple stove slots tick independently", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    state = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip")!;
    state = placeItemInZone(state, "stove", itemId("french-fries"), 4000, "flip")!;
    state = tickKitchenZones(state, 2000);
    // Both should have progressed
    const slot0 = state.stove[0];
    const slot1 = state.stove[1];
    if (slot0.tag === "working") expect(slot0.progressMs).toBe(2000);
    if (slot1.tag === "working") expect(slot1.progressMs).toBe(2000);
  });

  it("oven completes without interaction", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "oven", itemId("smoked-pork"), 8000, "auto")!;
    s = tickKitchenZones(s, 8001);
    expect(s.oven[0].tag).toBe("empty");
    expect(s.ready).toContain(itemId("smoked-pork"));
  });

  it("stove auto slot (sushi-rice) completes without flip", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "stove", itemId("sushi-rice"), 5000, "auto")!;
    s = tickKitchenZones(s, 5001);
    expect(s.stove[0].tag).toBe("empty");
    expect(s.ready).toContain(itemId("sushi-rice"));
  });

  it("ready pile accumulates items from all zones", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    // Place one in oven and one on cutting board
    state = placeItemInZone(state, "oven", itemId("smoked-pork"), 1000, "auto")!;
    state = placeItemInZone(state, "cuttingBoard", itemId("shredded-lettuce"), 1000, "hold")!;
    state = activateCuttingBoardSlot(state, 0, true);
    state = tickKitchenZones(state, 1001);
    expect(state.ready).toContain(itemId("smoked-pork"));
    expect(state.ready).toContain(itemId("shredded-lettuce"));
  });
});

// ---------------------------------------------------------------------------
// retrieveReadyItem
// ---------------------------------------------------------------------------

describe("retrieveReadyItem", () => {
  it("removes first match from ready pile", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    state = placeItemInZone(state, "oven", itemId("smoked-pork"), 1000, "auto")!;
    state = tickKitchenZones(state, 1001);
    expect(state.ready).toContain(itemId("smoked-pork"));

    const result = retrieveReadyItem(state, itemId("smoked-pork"));
    expect(result).toBeDefined();
    expect(result!.itemId).toBe(itemId("smoked-pork"));
    expect(result!.zones.ready).not.toContain(itemId("smoked-pork"));
  });

  it("returns undefined if item not in ready pile", () => {
    const state = createKitchenZoneState();
    const result = retrieveReadyItem(state, itemId("smoked-pork"));
    expect(result).toBeUndefined();
  });

  it("only removes one copy when multiple of same item are ready", () => {
    let state: KitchenZoneState = createKitchenZoneState();
    // Two oven slots, both auto-complete
    state = placeItemInZone(state, "oven", itemId("smoked-pork"), 1000, "auto")!;
    state = placeItemInZone(state, "oven", itemId("smoked-pork"), 1000, "auto")!;
    state = tickKitchenZones(state, 1001);
    expect(state.ready.filter((id) => id === itemId("smoked-pork"))).toHaveLength(2);

    const result = retrieveReadyItem(state, itemId("smoked-pork"));
    expect(result).toBeDefined();
    const remaining = result!.zones.ready.filter((id) => id === itemId("smoked-pork"));
    expect(remaining).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe("kitchen-zones properties", () => {
  it("progress never negative after ticking", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100_000 }),
        (delta) => {
          const state = createKitchenZoneState();
          const s1 = placeItemInZone(state, "stove", itemId("grilled-patty"), 5000, "flip");
          if (s1 === undefined) return;
          const s2 = tickKitchenZones(s1, delta);
          s2.stove.forEach((slot) => {
            if (slot.tag === "working") {
              expect(slot.progressMs).toBeGreaterThanOrEqual(0);
            }
            if (slot.tag === "needs_flip") {
              expect(slot.progressMs).toBeGreaterThanOrEqual(0);
            }
          });
        }
      )
    );
  });

  it("ready pile only grows or shrinks by 1 per retrieveReadyItem", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        (delta) => {
          let state = createKitchenZoneState();
          state = placeItemInZone(state, "oven", itemId("smoked-pork"), 5000, "auto")!;
          state = tickKitchenZones(state, delta);
          const beforeLen = state.ready.length;
          const result = retrieveReadyItem(state, itemId("smoked-pork"));
          if (result === undefined) {
            expect(beforeLen).toBe(0); // nothing to retrieve
          } else {
            expect(result.zones.ready.length).toBe(beforeLen - 1);
          }
        }
      )
    );
  });

  it("auto oven items always complete eventually", () => {
    const state = createKitchenZoneState();
    let s = placeItemInZone(state, "oven", itemId("smoked-pork"), 5000, "auto")!;
    s = tickKitchenZones(s, 5001);
    expect(s.ready).toContain(itemId("smoked-pork"));
  });
});
