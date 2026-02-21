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
  takeOrder,
  sendOrderToKitchen,
  serveOrder,
  notifyOrderReady,
  tickCustomerPatience,
  removeExpiredCustomers,
  activeSceneForPhase,
  isRestaurantIdle,
  movePlayer,
  defaultDurations,
  type DayCycle,
  type Phase,
  type ServicePhase,
  type Customer,
  type PhaseDurations,
  isTimedPhase,
} from "../day-cycle";

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
  it("transitions from kitchen_prep to service with empty tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(service.phase.remainingMs).toBe(defaultDurations.serviceMs);
    expect(service.phase.tables.every((t) => t.tag === "empty")).toBe(true);
    expect(service.phase.customersServed).toBe(0);
    expect(service.phase.customerQueue).toEqual([]);
    expect(service.phase.earnings).toBe(0);
    expect(service.phase.playerLocation).toBe("floor");
  });

  it("preserves day number", () => {
    const cycle = createDayCycle(2);
    const prepped = advanceToKitchenPrep(cycle, 10_000);
    const service = advanceToService(prepped, 60_000);
    expect(service.day).toBe(2);
  });

  it("creates default 4 tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(service.phase.tables).toHaveLength(4);
  });

  it("creates explicit table count", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs, 6);
    if (service.phase.tag !== "service") throw new Error("expected service");
    expect(service.phase.tables).toHaveLength(6);
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

  it("carries over customersServed and accumulated earnings", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    // Directly construct a service phase with serving history
    const phaseWithEarnings: ServicePhase = {
      ...service.phase,
      customersServed: 3,
      earnings: 14,
    };
    const withServed: DayCycle = { ...service, phase: phaseWithEarnings };
    const ended = advanceToDayEnd(withServed);

    expect(ended.phase.tag).toBe("day_end");
    if (ended.phase.tag === "day_end") {
      expect(ended.phase.customersServed).toBe(3);
      expect(ended.phase.earnings).toBe(14);
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
// Service sub-phases (new model)
// ---------------------------------------------------------------------------
describe("enqueueCustomer", () => {
  it("seats customer at first empty table", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const customer = createCustomer(customerId("c1"), itemId("classic-burger"));
    const updated = enqueueCustomer(service.phase, customer);
    expect(updated.tables[0].tag).toBe("customer_waiting");
    if (updated.tables[0].tag === "customer_waiting") {
      expect(updated.tables[0].customer.id).toBe(customerId("c1"));
    }
    expect(updated.customerQueue).toHaveLength(0);
  });

  it("fills tables sequentially", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    const q1 = enqueueCustomer(service.phase, c1);
    const q2 = enqueueCustomer(q1, c2);
    expect(q2.tables[0].tag).toBe("customer_waiting");
    expect(q2.tables[1].tag).toBe("customer_waiting");
    expect(q2.customerQueue).toHaveLength(0);
  });

  it("adds to overflow queue when all tables full", () => {
    const cycle = createDayCycle(1);
    const service = advanceToService(
      advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs,
      1 // only 1 table
    );
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    const q1 = enqueueCustomer(service.phase, c1);
    const q2 = enqueueCustomer(q1, c2);
    expect(q2.tables[0].tag).toBe("customer_waiting");
    expect(q2.customerQueue).toHaveLength(1);
    expect(q2.customerQueue[0].id).toBe(customerId("c2"));
  });
});

describe("takeOrder / sendOrderToKitchen / serveOrder", () => {
  const makeService = () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    return service.phase;
  };

  it("takeOrder transitions customer_waiting to order_pending", () => {
    let phase = makeService();
    phase = enqueueCustomer(phase, createCustomer(customerId("c1"), itemId("classic-burger")));
    phase = takeOrder(phase, 0);
    expect(phase.tables[0].tag).toBe("order_pending");
  });

  it("sendOrderToKitchen transitions order_pending to in_kitchen", () => {
    let phase = makeService();
    phase = enqueueCustomer(phase, createCustomer(customerId("c1"), itemId("classic-burger")));
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    expect(phase.tables[0].tag).toBe("in_kitchen");
    expect(phase.kitchen.pendingOrders).toHaveLength(1);
    expect(phase.kitchen.pendingOrders[0].dishId).toBe(itemId("classic-burger"));
  });

  it("serveOrder transitions ready_to_serve to empty and updates earnings", () => {
    let phase = makeService();
    phase = enqueueCustomer(phase, createCustomer(customerId("c1"), itemId("classic-burger")));
    phase = takeOrder(phase, 0);
    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);
    phase = notifyOrderReady(phase, oid);
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: oid, customerId: customerId("c1"), dishId: itemId("classic-burger") }] } };
    phase = serveOrder(phase, 0, 8);

    expect(phase.tables[0].tag).toBe("empty");
    expect(phase.customersServed).toBe(1);
    expect(phase.earnings).toBe(8);
  });

  it("accumulates earnings across multiple serves", () => {
    let phase = makeService();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2);

    // Serve first customer
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    phase = notifyOrderReady(phase, orderId("o1"));
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("classic-burger") }] } };
    phase = serveOrder(phase, 0, 5);
    expect(phase.customersServed).toBe(1);
    expect(phase.earnings).toBe(5);

    // Serve second customer
    phase = takeOrder(phase, 1);
    phase = sendOrderToKitchen(phase, 1, orderId("o2"));
    phase = notifyOrderReady(phase, orderId("o2"));
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [...phase.kitchen.orderUp, { id: orderId("o2"), customerId: customerId("c2"), dishId: itemId("cheeseburger") }] } };
    phase = serveOrder(phase, 1, 5);
    expect(phase.customersServed).toBe(2);
    expect(phase.earnings).toBe(10);
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

  it("maps service (player on floor) to RestaurantScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    expect(activeSceneForPhase(service.phase)).toBe("RestaurantScene");
  });

  it("maps service (player in kitchen) to KitchenScene", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), 10_000),
      60_000
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const inKitchen = movePlayer(service.phase, "kitchen");
    const cycle: DayCycle = { ...service, phase: inKitchen };
    expect(activeSceneForPhase(cycle.phase)).toBe("KitchenScene");
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
  it("reduces patience of customers at tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 45_000);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    const ticked = tickCustomerPatience(phase, 10_000);
    // Both seated at tables
    expect(ticked.tables[0].tag).toBe("customer_waiting");
    if (ticked.tables[0].tag === "customer_waiting") {
      expect(ticked.tables[0].customer.patienceMs).toBe(20_000);
    }
    expect(ticked.tables[1].tag).toBe("customer_waiting");
    if (ticked.tables[1].tag === "customer_waiting") {
      expect(ticked.tables[1].customer.patienceMs).toBe(35_000);
    }
  });

  it("clamps patience at zero", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 5_000);
    const phase = enqueueCustomer(service.phase, c1);

    const ticked = tickCustomerPatience(phase, 99_000);
    if (ticked.tables[0].tag === "customer_waiting") {
      expect(ticked.tables[0].customer.patienceMs).toBe(0);
    }
  });

  it("ticks patience for customers in queue overflow", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs,
      1 // 1 table only
    );
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 45_000);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);
    // c2 is in overflow queue

    const ticked = tickCustomerPatience(phase, 10_000);
    expect(ticked.customerQueue[0].patienceMs).toBe(35_000);
  });
});

describe("removeExpiredCustomers", () => {
  it("removes customers with zero patience from tables", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 30_000);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    const cleaned = removeExpiredCustomers(phase);
    // c1 expired at table[0], table is now empty
    expect(cleaned.tables[0].tag).toBe("empty");
    // c2 still seated at table[1]
    expect(cleaned.tables[1].tag).toBe("customer_waiting");
  });

  it("removes customers with zero patience from overflow queue", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs,
      1 // 1 table
    );
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 0);
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.customerQueue).toHaveLength(0);
    expect(cleaned.customersLost).toBe(1);
  });

  it("keeps customers with remaining patience", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const phase = enqueueCustomer(service.phase, c1);

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.tables[0].tag).toBe("customer_waiting");
  });

  it("increments customersLost count for expired customers", () => {
    const cycle = createDayCycle(1);
    const prepped = advanceToKitchenPrep(cycle, defaultDurations.kitchenPrepMs);
    const service = advanceToService(prepped, defaultDurations.serviceMs);
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 0);
    const c3 = createCustomer(customerId("c3"), itemId("loaded-fries"), 30_000);
    const phase = enqueueCustomer(
      enqueueCustomer(enqueueCustomer(service.phase, c1), c2),
      c3
    );

    const cleaned = removeExpiredCustomers(phase);
    expect(cleaned.customersLost).toBe(2);
  });

  it("seats queued customer when expired customer frees a table", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs,
      1 // 1 table
    );
    if (service.phase.tag !== "service") throw new Error("expected service");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 0); // expires
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 30_000); // waiting
    const phase = enqueueCustomer(enqueueCustomer(service.phase, c1), c2);
    // c2 is in overflow queue because table is full

    const cleaned = removeExpiredCustomers(phase);
    // c1 expired, c2 should now be seated
    expect(cleaned.tables[0].tag).toBe("customer_waiting");
    if (cleaned.tables[0].tag === "customer_waiting") {
      expect(cleaned.tables[0].customer.id).toBe(customerId("c2"));
    }
    expect(cleaned.customerQueue).toHaveLength(0);
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

  it("returns true when all tables empty, kitchen idle, no queue", () => {
    expect(isRestaurantIdle(makeService())).toBe(true);
  });

  it("returns false when a customer is seated", () => {
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const phase = enqueueCustomer(makeService(), c1);
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when customers are in overflow queue", () => {
    const service = advanceToService(
      advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
      defaultDurations.serviceMs,
      0 // no tables
    );
    if (service.phase.tag !== "service") throw new Error("expected service");
    const phase = enqueueCustomer(service.phase, createCustomer(customerId("c1"), itemId("classic-burger")));
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when order is in_kitchen", () => {
    let phase = makeService();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when table is ready_to_serve", () => {
    let phase = makeService();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    phase = notifyOrderReady(phase, orderId("o1"));
    expect(isRestaurantIdle(phase)).toBe(false);
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

  it("serveOrder: earnings accumulate monotonically", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100 }),
        fc.nat({ max: 100 }),
        (price1, price2) => {
          const service = advanceToService(
            advanceToKitchenPrep(createDayCycle(1), 10_000),
            60_000
          );
          if (service.phase.tag !== "service")
            throw new Error("expected service");

          const c1 = createCustomer(customerId("c1"), itemId("dish-a"));
          const c2 = createCustomer(customerId("c2"), itemId("dish-b"));
          let phase = enqueueCustomer(
            enqueueCustomer(service.phase, c1),
            c2
          );

          // Serve first customer
          const oid1 = orderId("o1");
          phase = takeOrder(phase, 0);
          phase = sendOrderToKitchen(phase, 0, oid1);
          phase = notifyOrderReady(phase, oid1);
          phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: oid1, customerId: customerId("c1"), dishId: itemId("dish-a") }] } };
          phase = serveOrder(phase, 0, price1);
          expect(phase.earnings).toBe(price1);

          // Serve second customer
          const oid2 = orderId("o2");
          phase = takeOrder(phase, 1);
          phase = sendOrderToKitchen(phase, 1, oid2);
          phase = notifyOrderReady(phase, oid2);
          phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [...phase.kitchen.orderUp, { id: oid2, customerId: customerId("c2"), dishId: itemId("dish-b") }] } };
          phase = serveOrder(phase, 1, price2);
          expect(phase.earnings).toBe(price1 + price2);
        }
      )
    );
  });
});
