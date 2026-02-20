import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  createDayCycle,
  tickTimer,
  isPhaseTimerExpired,
  timerFraction,
  advanceToKitchenPrep,
  advanceToService,
  advanceToDayEnd,
  advanceToNextDay,
  enqueueCustomer,
  beginTakingOrder,
  beginCooking,
  finishCooking,
  finishServing,
  activeSceneForPhase,
  calculateEarnings,
  defaultDurations,
  type DayCycle,
  type Phase,
  type ServiceSubPhase,
  type Customer,
  type PhaseDurations,
} from "../day-cycle";

// ---------------------------------------------------------------------------
// createDayCycle
// ---------------------------------------------------------------------------
describe("createDayCycle", () => {
  it("creates day 1 in grocery phase with full timer", () => {
    const cycle = createDayCycle(1);
    expect(cycle.day).toBe(1);
    expect(cycle.phase.tag).toBe("grocery");
    expect(cycle.phase.remainingMs).toBe(defaultDurations.groceryMs);
    expect(cycle.phase.durationMs).toBe(defaultDurations.groceryMs);
  });

  it("accepts custom durations", () => {
    const durations: PhaseDurations = {
      groceryMs: 5_000,
      kitchenPrepMs: 10_000,
      serviceMs: 60_000,
    };
    const cycle = createDayCycle(3, durations);
    expect(cycle.day).toBe(3);
    expect(cycle.phase.remainingMs).toBe(5_000);
    expect(cycle.phase.durationMs).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// tickTimer
// ---------------------------------------------------------------------------
describe("tickTimer", () => {
  it("subtracts elapsed time from remaining", () => {
    const cycle = createDayCycle(1);
    const ticked = tickTimer(cycle, 1_000);
    expect(ticked.phase.remainingMs).toBe(defaultDurations.groceryMs - 1_000);
  });

  it("clamps at zero", () => {
    const cycle = createDayCycle(1);
    const ticked = tickTimer(cycle, 999_999);
    expect(ticked.phase.remainingMs).toBe(0);
  });

  it("does not change phase tag", () => {
    const cycle = createDayCycle(1);
    const ticked = tickTimer(cycle, 999_999);
    expect(ticked.phase.tag).toBe("grocery");
  });

  it("preserves day", () => {
    const cycle = createDayCycle(5);
    const ticked = tickTimer(cycle, 1_000);
    expect(ticked.day).toBe(5);
  });

  it("does nothing for day_end phase", () => {
    const cycle = createDayCycle(1);
    const atService = advanceToService(
      advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs
    );
    const atEnd = advanceToDayEnd(atService);
    const ticked = tickTimer(atEnd, 5_000);
    expect(ticked).toEqual(atEnd);
  });
});

// ---------------------------------------------------------------------------
// isPhaseTimerExpired
// ---------------------------------------------------------------------------
describe("isPhaseTimerExpired", () => {
  it("returns false when timer has time left", () => {
    expect(isPhaseTimerExpired(createDayCycle(1))).toBe(false);
  });

  it("returns true when timer is zero", () => {
    const expired = tickTimer(createDayCycle(1), 999_999);
    expect(isPhaseTimerExpired(expired)).toBe(true);
  });

  it("returns false for day_end (no timer)", () => {
    const cycle = createDayCycle(1);
    const atService = advanceToService(
      advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs
    );
    const atEnd = advanceToDayEnd(atService);
    expect(isPhaseTimerExpired(atEnd)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// timerFraction
// ---------------------------------------------------------------------------
describe("timerFraction", () => {
  it("returns 1.0 at full timer", () => {
    const cycle = createDayCycle(1);
    expect(timerFraction(cycle.phase)).toBe(1.0);
  });

  it("returns 0.5 at half timer", () => {
    const cycle = createDayCycle(1);
    const half = tickTimer(cycle, defaultDurations.groceryMs / 2);
    expect(timerFraction(half.phase)).toBeCloseTo(0.5);
  });

  it("returns 0.0 when expired", () => {
    const expired = tickTimer(createDayCycle(1), 999_999);
    expect(timerFraction(expired.phase)).toBe(0.0);
  });

  it("returns 0.0 for day_end", () => {
    const cycle = createDayCycle(1);
    const atService = advanceToService(
      advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs
    );
    const atEnd = advanceToDayEnd(atService);
    expect(timerFraction(atEnd.phase)).toBe(0.0);
  });
});

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------
describe("advanceToKitchenPrep", () => {
  it("transitions from grocery to kitchen_prep", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    expect(prepped.phase.tag).toBe("kitchen_prep");
    expect(prepped.phase.remainingMs).toBe(defaultDurations.kitchenPrepMs);
    expect(prepped.phase.durationMs).toBe(defaultDurations.kitchenPrepMs);
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(3);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    expect(prepped.day).toBe(3);
  });
});

describe("advanceToService", () => {
  it("transitions from kitchen_prep to service", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    expect(service.phase.tag).toBe("service");
    if (service.phase.tag === "service") {
      expect(service.phase.remainingMs).toBe(defaultDurations.serviceMs);
      expect(service.phase.subPhase.tag).toBe("waiting_for_customer");
      expect(service.phase.customersServed).toBe(0);
      expect(service.phase.customerQueue).toEqual([]);
    }
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(2);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    const service = advanceToService(prepped, 60_000);
    expect(service.day).toBe(2);
  });
});

describe("advanceToDayEnd", () => {
  it("transitions from service to day_end", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    const ended = advanceToDayEnd(service);
    expect(ended.phase.tag).toBe("day_end");
    if (ended.phase.tag === "day_end") {
      expect(ended.phase.customersServed).toBe(0);
      expect(ended.phase.earnings).toBe(0);
    }
  });

  it("carries over customersServed and calculates earnings", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);

    // Simulate serving 3 customers
    if (service.phase.tag !== "service") throw new Error("expected service");
    const customer1: Customer = { id: "c1" };
    const customer2: Customer = { id: "c2" };
    const customer3: Customer = { id: "c3" };

    let phase = enqueueCustomer(service.phase, customer1);
    phase = enqueueCustomer(phase, customer2);
    phase = enqueueCustomer(phase, customer3);

    // Serve all 3 customers through the full cycle
    const served1Taking = beginTakingOrder(phase)!;
    const served1Cooking = beginCooking(served1Taking, "o1");
    const served1Cooked = finishCooking(served1Cooking);
    const served1Done = finishServing(served1Cooked);

    const served2Taking = beginTakingOrder(served1Done)!;
    const served2Cooking = beginCooking(served2Taking, "o2");
    const served2Cooked = finishCooking(served2Cooking);
    const served2Done = finishServing(served2Cooked);

    const served3Taking = beginTakingOrder(served2Done)!;
    const served3Cooking = beginCooking(served3Taking, "o3");
    const served3Cooked = finishCooking(served3Cooking);
    const served3Done = finishServing(served3Cooked);

    const withServed: DayCycle = { ...service, phase: served3Done };
    const ended = advanceToDayEnd(withServed);

    expect(ended.phase.tag).toBe("day_end");
    if (ended.phase.tag === "day_end") {
      expect(ended.phase.customersServed).toBe(3);
      expect(ended.phase.earnings).toBe(15); // 5 coins per customer
    }
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(4);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    const service = advanceToService(prepped, 60_000);
    const ended = advanceToDayEnd(service);
    expect(ended.day).toBe(4);
  });
});

describe("advanceToNextDay", () => {
  it("increments day and starts grocery phase", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    const ended = advanceToDayEnd(service);
    const next = advanceToNextDay(ended);
    expect(next.day).toBe(2);
    expect(next.phase.tag).toBe("grocery");
    expect(next.phase.remainingMs).toBe(defaultDurations.groceryMs);
  });

  it("accepts custom durations for next day", () => {
    const durations: PhaseDurations = {
      groceryMs: 5_000,
      kitchenPrepMs: 10_000,
      serviceMs: 60_000,
    };
    const cycle = createDayCycle(1, durations);
    const prepped = advanceToKitchenPrep(cycle, durations.kitchenPrepMs);
    const service = advanceToService(prepped, durations.serviceMs);
    const ended = advanceToDayEnd(service);
    const next = advanceToNextDay(ended, durations);
    expect(next.day).toBe(2);
    expect(next.phase.remainingMs).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// Service sub-phases
// ---------------------------------------------------------------------------
describe("enqueueCustomer", () => {
  it("adds a customer to the queue", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const customer: Customer = { id: "c1" };
    const updated = enqueueCustomer(service.phase, customer);
    expect(updated.customerQueue).toEqual([customer]);
  });

  it("appends to existing queue", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const c2: Customer = { id: "c2" };
    const q1 = enqueueCustomer(service.phase, c1);
    const q2 = enqueueCustomer(q1, c2);
    expect(q2.customerQueue).toEqual([c1, c2]);
  });
});

describe("beginTakingOrder", () => {
  it("pops first customer from queue into taking_order", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const c2: Customer = { id: "c2" };
    const queued = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);
    const taking = beginTakingOrder(queued);

    expect(taking).toBeDefined();
    expect(taking!.subPhase.tag).toBe("taking_order");
    if (taking!.subPhase.tag === "taking_order") {
      expect(taking!.subPhase.customer).toEqual(c1);
    }
    expect(taking!.customerQueue).toEqual([c2]);
  });

  it("returns undefined when queue is empty", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    expect(beginTakingOrder(service.phase)).toBeUndefined();
  });

  it("returns undefined when not in waiting_for_customer", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    // Already in taking_order, can't begin again
    expect(beginTakingOrder(taking)).toBeUndefined();
  });
});

describe("beginCooking", () => {
  it("transitions from taking_order to cooking", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, "order-1");

    expect(cooking.subPhase.tag).toBe("cooking");
    if (cooking.subPhase.tag === "cooking") {
      expect(cooking.subPhase.order.id).toBe("order-1");
      expect(cooking.subPhase.order.customerId).toBe("c1");
    }
  });
});

describe("finishCooking", () => {
  it("transitions from cooking to serving", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, "order-1");
    const serving = finishCooking(cooking);

    expect(serving.subPhase.tag).toBe("serving");
    if (serving.subPhase.tag === "serving") {
      expect(serving.subPhase.order.id).toBe("order-1");
    }
  });
});

describe("finishServing", () => {
  it("transitions from serving to waiting and increments customersServed", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, "order-1");
    const cooked = finishCooking(cooking);
    const done = finishServing(cooked);

    expect(done.subPhase.tag).toBe("waiting_for_customer");
    expect(done.customersServed).toBe(1);
  });

  it("accumulates customersServed across multiple cycles", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1: Customer = { id: "c1" };
    const c2: Customer = { id: "c2" };
    let phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    // Serve first customer
    const t1 = beginTakingOrder(phase)!;
    const cook1 = beginCooking(t1, "o1");
    const cooked1 = finishCooking(cook1);
    phase = finishServing(cooked1);
    expect(phase.customersServed).toBe(1);

    // Serve second customer
    const t2 = beginTakingOrder(phase)!;
    const cook2 = beginCooking(t2, "o2");
    const cooked2 = finishCooking(cook2);
    phase = finishServing(cooked2);
    expect(phase.customersServed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
describe("activeSceneForPhase", () => {
  it("maps grocery to GroceryScene", () => {
    const cycle = createDayCycle(1);
    expect(activeSceneForPhase(cycle.phase)).toBe("GroceryScene");
  });

  it("maps kitchen_prep to KitchenScene", () => {
    const prepped = advanceToKitchenPrep(createDayCycle(1), 10_000);
    expect(activeSceneForPhase(prepped.phase)).toBe("KitchenScene");
  });

  it("maps service (waiting) to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    expect(activeSceneForPhase(service.phase)).toBe("RestaurantScene");
  });

  it("maps service (cooking) to KitchenScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, "o1");
    const cookingCycle: DayCycle = { ...service, phase: cooking };
    expect(activeSceneForPhase(cookingCycle.phase)).toBe("KitchenScene");
  });

  it("maps service (taking_order) to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const takingCycle: DayCycle = { ...service, phase: taking };
    expect(activeSceneForPhase(takingCycle.phase)).toBe("RestaurantScene");
  });

  it("maps service (serving) to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const c1: Customer = { id: "c1" };
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, "o1");
    const cooked = finishCooking(cooking);
    const servingCycle: DayCycle = { ...service, phase: cooked };
    expect(activeSceneForPhase(servingCycle.phase)).toBe("RestaurantScene");
  });

  it("maps day_end to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    const ended = advanceToDayEnd(service);
    expect(activeSceneForPhase(ended.phase)).toBe("RestaurantScene");
  });
});

describe("calculateEarnings", () => {
  it("returns 5 coins per customer", () => {
    expect(calculateEarnings(0)).toBe(0);
    expect(calculateEarnings(1)).toBe(5);
    expect(calculateEarnings(3)).toBe(15);
    expect(calculateEarnings(10)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe("property-based tests", () => {
  it("tickTimer: remainingMs is always >= 0", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (elapsed) => {
        const cycle = createDayCycle(1);
        const ticked = tickTimer(cycle, elapsed);
        expect(ticked.phase.remainingMs).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it("timerFraction: always in [0, 1]", () => {
    fc.assert(
      fc.property(fc.nat({ max: 1_000_000 }), (elapsed) => {
        const cycle = createDayCycle(1);
        const ticked = tickTimer(cycle, elapsed);
        const frac = timerFraction(ticked.phase);
        expect(frac).toBeGreaterThanOrEqual(0.0);
        expect(frac).toBeLessThanOrEqual(1.0);
      })
    );
  });

  it("advanceToNextDay increments day by 1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (day) => {
        const cycle = createDayCycle(day);
        const prepped = advanceToKitchenPrep(cycle, 10_000);
        const service = advanceToService(prepped, 60_000);
        const ended = advanceToDayEnd(service);
        const next = advanceToNextDay(ended);
        expect(next.day).toBe(day + 1);
      })
    );
  });

  it("calculateEarnings: is always non-negative", () => {
    fc.assert(
      fc.property(fc.nat(), (served) => {
        expect(calculateEarnings(served)).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it("calculateEarnings: is monotonically increasing", () => {
    fc.assert(
      fc.property(fc.nat(), (served) => {
        expect(calculateEarnings(served + 1)).toBeGreaterThanOrEqual(
          calculateEarnings(served)
        );
      })
    );
  });
});
