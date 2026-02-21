import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { customerId, orderId, itemId } from "../branded";
import {
  createDayCycle,
  createCustomer,
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
  abandonOrder,
  activeCustomerId,
  tickCustomerPatience,
  removeExpiredCustomers,
  activeSceneForPhase,
  isRestaurantIdle,
  defaultDurations,
  type DayCycle,
  type Phase,
  type ServiceSubPhase,
  type Customer,
  type PhaseDurations,
  isTimedPhase,
} from "../day-cycle";
import { tableCount, seatCustomer } from "../tables";

// ---------------------------------------------------------------------------
// createDayCycle
// ---------------------------------------------------------------------------
describe("createDayCycle", () => {
  it("creates day 1 in grocery phase with full timer", () => {
    const cycle = createDayCycle(1);
    expect(cycle.day).toBe(1);
    expect(cycle.phase.tag).toBe("grocery");
    if (!isTimedPhase(cycle.phase)) throw new Error("expected timed phase");
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
    if (!isTimedPhase(cycle.phase)) throw new Error("expected timed phase");
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
    if (!isTimedPhase(ticked.phase)) throw new Error("expected timed phase");
    expect(ticked.phase.remainingMs).toBe(defaultDurations.groceryMs - 1_000);
  });

  it("clamps at zero", () => {
    const cycle = createDayCycle(1);
    const ticked = tickTimer(cycle, 999_999);
    if (!isTimedPhase(ticked.phase)) throw new Error("expected timed phase");
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
    if (!isTimedPhase(prepped.phase)) throw new Error("expected timed phase");
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
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(service.phase.remainingMs).toBe(defaultDurations.serviceMs);
    expect(service.phase.subPhase.tag).toBe("waiting_for_customer");
    expect(service.phase.customersServed).toBe(0);
    expect(service.phase.customerQueue).toEqual([]);
    expect(service.phase.earnings).toBe(0);
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(2);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    const service = advanceToService(prepped, 60_000);
    expect(service.day).toBe(2);
  });

  it("creates tableLayout with default 4 tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(tableCount(service.phase.tableLayout)).toBe(4);
  });

  it("creates tableLayout with explicit table count", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs, 6);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(tableCount(service.phase.tableLayout)).toBe(6);
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

  it("carries over customersServed and accumulated earnings from dish prices", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);

    // Simulate serving 3 customers with different sell prices
    if (service.phase.tag !== "service") throw new Error("expected service");
    const customer1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const customer2 = createCustomer(customerId("c2"), itemId("bacon-cheeseburger"));
    const customer3 = createCustomer(customerId("c3"), itemId("miso-soup"));

    let phase = enqueueCustomer(service.phase, customer1);
    phase = enqueueCustomer(phase, customer2);
    phase = enqueueCustomer(phase, customer3);

    // Serve all 3 customers with their respective sell prices
    const served1Taking = beginTakingOrder(phase)!;
    const served1Cooking = beginCooking(served1Taking, orderId("o1"), itemId("classic-burger"));
    const served1Cooked = finishCooking(served1Cooking);
    const served1Done = finishServing(served1Cooked, 5); // classic-burger: $5

    const served2Taking = beginTakingOrder(served1Done)!;
    const served2Cooking = beginCooking(served2Taking, orderId("o2"), itemId("bacon-cheeseburger"));
    const served2Cooked = finishCooking(served2Cooking);
    const served2Done = finishServing(served2Cooked, 7); // bacon-cheeseburger: $7

    const served3Taking = beginTakingOrder(served2Done)!;
    const served3Cooking = beginCooking(served3Taking, orderId("o3"), itemId("miso-soup"));
    const served3Cooked = finishCooking(served3Cooking);
    const served3Done = finishServing(served3Cooked, 2); // miso-soup: $2

    const withServed: DayCycle = { ...service, phase: served3Done };
    const ended = advanceToDayEnd(withServed);

    expect(ended.phase.tag).toBe("day_end");
    if (ended.phase.tag === "day_end") {
      expect(ended.phase.customersServed).toBe(3);
      expect(ended.phase.earnings).toBe(14); // 5 + 7 + 2 = $14
    }
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(4);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    const service = advanceToService(prepped, 60_000);
    const ended = advanceToDayEnd(service);
    expect(ended.day).toBe(4);
  });

  it("carries customersLost from service phase", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    // Simulate 2 lost customers via removeExpiredCustomers
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 0);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);
    const cleaned = removeExpiredCustomers(phase);

    const withLost: DayCycle = { ...service, phase: cleaned };
    const ended = advanceToDayEnd(withLost);
    expect(ended.phase.tag).toBe("day_end");
    if (ended.phase.tag === "day_end") {
      expect(ended.phase.customersLost).toBe(2);
    }
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
    if (!isTimedPhase(next.phase)) throw new Error("expected timed phase");
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
    if (!isTimedPhase(next.phase)) throw new Error("expected timed phase");
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

    const customer = createCustomer(customerId("c1"), itemId("classic-burger"));
    const updated = enqueueCustomer(service.phase, customer);
    expect(updated.customerQueue).toEqual([customer]);
    expect(updated.customerQueue[0].dishId).toBe(itemId("classic-burger"));
  });

  it("appends to existing queue", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
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

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
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

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
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

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("order-1"), itemId("classic-burger"));

    expect(cooking.subPhase.tag).toBe("cooking");
    if (cooking.subPhase.tag === "cooking") {
      expect(cooking.subPhase.order.id).toBe(orderId("order-1"));
      expect(cooking.subPhase.order.customerId).toBe(customerId("c1"));
      expect(cooking.subPhase.order.dishId).toBe(itemId("classic-burger"));
    }
  });
});

describe("finishCooking", () => {
  it("transitions from cooking to serving", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("order-1"), itemId("classic-burger"));
    const serving = finishCooking(cooking);

    expect(serving.subPhase.tag).toBe("serving");
    if (serving.subPhase.tag === "serving") {
      expect(serving.subPhase.order.id).toBe(orderId("order-1"));
      expect(serving.subPhase.order.dishId).toBe(itemId("classic-burger"));
    }
  });
});

describe("abandonOrder", () => {
  it("transitions from taking_order back to waiting_for_customer", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const abandoned = abandonOrder(taking);

    expect(abandoned.subPhase.tag).toBe("waiting_for_customer");
    expect(abandoned.customersServed).toBe(0); // not served
  });

  it("transitions from cooking back to waiting_for_customer", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    const abandoned = abandonOrder(cooking);

    expect(abandoned.subPhase.tag).toBe("waiting_for_customer");
    expect(abandoned.customersServed).toBe(0);
  });

  it("activeCustomerId returns customer id from taking_order", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    expect(activeCustomerId(taking)).toBe(customerId("c1"));
  });

  it("activeCustomerId returns customer id from cooking", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    expect(activeCustomerId(cooking)).toBe(customerId("c1"));
  });

  it("activeCustomerId returns undefined when waiting", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(activeCustomerId(service.phase)).toBeUndefined();
  });

  it("does nothing when waiting_for_customer", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const result = abandonOrder(service.phase);
    expect(result.subPhase.tag).toBe("waiting_for_customer");
  });

  it("does nothing when serving", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    const cooked = finishCooking(cooking);
    const result = abandonOrder(cooked);

    // Already serving, shouldn't abandon
    expect(result.subPhase.tag).toBe("serving");
  });
});

describe("finishServing", () => {
  it("transitions from serving to waiting and increments customersServed", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("order-1"), itemId("classic-burger"));
    const cooked = finishCooking(cooking);
    const done = finishServing(cooked, 5);

    expect(done.subPhase.tag).toBe("waiting_for_customer");
    expect(done.customersServed).toBe(1);
    expect(done.earnings).toBe(5);
  });

  it("accumulates customersServed and earnings across multiple cycles", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    let phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    // Serve first customer (classic-burger @ $5)
    const t1 = beginTakingOrder(phase)!;
    const cook1 = beginCooking(t1, orderId("o1"), itemId("classic-burger"));
    const cooked1 = finishCooking(cook1);
    phase = finishServing(cooked1, 5);
    expect(phase.customersServed).toBe(1);
    expect(phase.earnings).toBe(5);

    // Serve second customer (cheeseburger @ $5)
    const t2 = beginTakingOrder(phase)!;
    const cook2 = beginCooking(t2, orderId("o2"), itemId("cheeseburger"));
    const cooked2 = finishCooking(cook2);
    phase = finishServing(cooked2, 5);
    expect(phase.customersServed).toBe(2);
    expect(phase.earnings).toBe(10);
  });

  it("accumulates different sell prices per dish", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("miso-soup"));
    const c2 = createCustomer(customerId("c2"), itemId("california-roll"));
    let phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    // Serve miso soup @ $2
    const t1 = beginTakingOrder(phase)!;
    const cook1 = beginCooking(t1, orderId("o1"), itemId("miso-soup"));
    const cooked1 = finishCooking(cook1);
    phase = finishServing(cooked1, 2);
    expect(phase.earnings).toBe(2);

    // Serve california roll @ $7
    const t2 = beginTakingOrder(phase)!;
    const cook2 = beginCooking(t2, orderId("o2"), itemId("california-roll"));
    const cooked2 = finishCooking(cook2);
    phase = finishServing(cooked2, 7);
    expect(phase.earnings).toBe(9);
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
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    const cookingCycle: DayCycle = { ...service, phase: cooking };
    expect(activeSceneForPhase(cookingCycle.phase)).toBe("KitchenScene");
  });

  it("maps service (taking_order) to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
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
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(service.phase, c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
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

describe("earnings accumulation", () => {
  it("service phase starts with zero earnings", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(service.phase.earnings).toBe(0);
  });

  it("day_end with no customers served has zero earnings", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    const ended = advanceToDayEnd(service);
    if (ended.phase.tag !== "day_end") throw new Error("expected day_end");
    expect(ended.phase.earnings).toBe(0);
    expect(ended.phase.customersServed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Customer patience
// ---------------------------------------------------------------------------
describe("createCustomer", () => {
  it("creates a customer with default patience (60s)", () => {
    const c = createCustomer(customerId("c1"), itemId("classic-burger"));
    expect(c.id).toBe(customerId("c1"));
    expect(c.dishId).toBe(itemId("classic-burger"));
    expect(c.patienceMs).toBe(60_000);
    expect(c.maxPatienceMs).toBe(60_000);
  });

  it("accepts custom patience", () => {
    const c = createCustomer(customerId("c1"), itemId("miso-soup"), 30_000);
    expect(c.patienceMs).toBe(30_000);
    expect(c.maxPatienceMs).toBe(30_000);
  });
});

describe("tickCustomerPatience", () => {
  it("reduces patience of queued customers", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 45_000);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    const ticked = tickCustomerPatience(phase, 10_000);
    expect(ticked.customerQueue[0].patienceMs).toBe(20_000);
    expect(ticked.customerQueue[1].patienceMs).toBe(35_000);
  });

  it("clamps patience at zero", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 5_000);
    const phase = enqueueCustomer(service.phase, c1);

    const ticked = tickCustomerPatience(phase, 99_000);
    expect(ticked.customerQueue[0].patienceMs).toBe(0);
  });

  it("does not affect active customer (not in queue)", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 45_000);
    const queued = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);
    const taking = beginTakingOrder(queued)!;

    // c1 is now active (taking_order), c2 is in queue
    const ticked = tickCustomerPatience(taking, 10_000);
    // Only c2 in queue should be ticked
    expect(ticked.customerQueue.length).toBe(1);
    expect(ticked.customerQueue[0].patienceMs).toBe(35_000);
  });
});

describe("removeExpiredCustomers", () => {
  it("removes customers with zero patience from queue", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0); // already expired
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 30_000);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.customerQueue.length).toBe(1);
    expect(cleaned.customerQueue[0].id).toBe(customerId("c2"));
  });

  it("unseats expired customers from tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    // Manually seat and enqueue an expired customer
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0);
    const seatedLayout = seatCustomer(service.phase.tableLayout, service.phase.tableLayout.tables[0].id, customerId("c1"));
    const withSeat = { ...service.phase, tableLayout: seatedLayout };
    const queued = enqueueCustomer(withSeat, c1);

    const cleaned = removeExpiredCustomers(queued);
    // Customer should be removed from queue AND unseated
    expect(cleaned.customerQueue.length).toBe(0);
    expect(cleaned.tableLayout.tables[0].customerId).toBeUndefined();
  });

  it("keeps customers with remaining patience", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const phase = enqueueCustomer(service.phase, c1);

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.customerQueue.length).toBe(1);
  });

  it("increments customersLost count for expired customers", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0); // expired
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 0); // expired
    const c3 = createCustomer(customerId("c3"), itemId("loaded-fries"), 30_000); // still patient
    const phase = enqueueCustomer(
      enqueueCustomer(enqueueCustomer(service.phase, c1), c2),
      c3
    );

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.customersLost).toBe(2);
    expect(cleaned.customerQueue.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// isRestaurantIdle
// ---------------------------------------------------------------------------
describe("isRestaurantIdle", () => {
  const makeService = () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    return service.phase;
  };

  it("returns true when waiting and no customers in queue", () => {
    expect(isRestaurantIdle(makeService())).toBe(true);
  });

  it("returns false when customers are queued", () => {
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(makeService(), c1);
    expect(isRestaurantIdle(queued)).toBe(false);
  });

  it("returns false when subPhase is taking_order", () => {
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(makeService(), c1);
    const taking = beginTakingOrder(queued)!;
    expect(isRestaurantIdle(taking)).toBe(false);
  });

  it("returns false when cooking", () => {
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(makeService(), c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    expect(isRestaurantIdle(cooking)).toBe(false);
  });

  it("returns false when serving", () => {
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const queued = enqueueCustomer(makeService(), c1);
    const taking = beginTakingOrder(queued)!;
    const cooking = beginCooking(taking, orderId("o1"), itemId("classic-burger"));
    const serving = finishCooking(cooking);
    expect(isRestaurantIdle(serving)).toBe(false);
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
        if (!isTimedPhase(ticked.phase)) throw new Error("expected timed phase");
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

  it("finishServing: earnings accumulate monotonically", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (price1, price2) => {
          const cycle = createDayCycle(1);
          const prepped = advanceToKitchenPrep(cycle, 10_000);
          const service = advanceToService(prepped, 60_000);
          if (service.phase.tag !== "service")
            throw new Error("expected service");

          const c1 = createCustomer(customerId("c1"), itemId("dish-a"));
          const c2 = createCustomer(customerId("c2"), itemId("dish-b"));
          let phase = enqueueCustomer(
            enqueueCustomer(service.phase, c1),
            c2
          );

          const t1 = beginTakingOrder(phase)!;
          const cook1 = beginCooking(t1, orderId("o1"), itemId("dish-a"));
          const cooked1 = finishCooking(cook1);
          phase = finishServing(cooked1, price1);
          expect(phase.earnings).toBe(price1);

          const t2 = beginTakingOrder(phase)!;
          const cook2 = beginCooking(t2, orderId("o2"), itemId("dish-b"));
          const cooked2 = finishCooking(cook2);
          phase = finishServing(cooked2, price2);
          expect(phase.earnings).toBe(price1 + price2);
        }
      )
    );
  });
});
