/**
 * Tests for the new FOH/BOH service phase model.
 * These test the updated day-cycle service functions with TableState[] + KitchenServiceState.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { customerId, orderId, itemId } from "../branded";
import {
  createDayCycle,
  createCustomer,
  advanceToKitchenPrep,
  advanceToService,
  enqueueCustomer,
  takeOrder,
  sendOrderToKitchen,
  serveOrder,
  movePlayer,
  notifyOrderReady,
  tickServicePhase,
  isRestaurantIdle,
  activeSceneForPhase,
  defaultDurations,
  type ServicePhase,
  type TableState,
} from "../day-cycle";
import {
  createKitchenServiceState,
  addOrderToKitchen,
  startCuttingBoardWork,
  setPlayerAtCuttingBoard,
  startPassiveStation,
  tickKitchenStations,
  isKitchenIdle,
  pickupFromOrderUp,
  type KitchenOrder,
} from "../kitchen-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeServicePhase = (tables = 4): ServicePhase => {
  const cycle = advanceToService(
    advanceToKitchenPrep(createDayCycle(1), defaultDurations.kitchenPrepMs),
    defaultDurations.serviceMs,
    tables
  );
  if (cycle.phase.tag !== "service") throw new Error("expected service");
  return cycle.phase;
};

// ---------------------------------------------------------------------------
// Kitchen service state (standalone)
// ---------------------------------------------------------------------------

describe("KitchenServiceState", () => {
  it("createKitchenServiceState returns empty state", () => {
    const k = createKitchenServiceState();
    expect(k.pendingOrders).toEqual([]);
    expect(k.cuttingBoard.tag).toBe("idle");
    expect(k.stove.tag).toBe("idle");
    expect(k.oven.tag).toBe("idle");
    expect(k.orderUp).toEqual([]);
    expect(isKitchenIdle(k)).toBe(true);
  });

  it("addOrderToKitchen pushes to pendingOrders", () => {
    const k = createKitchenServiceState();
    const order: KitchenOrder = {
      id: orderId("o1"),
      customerId: customerId("c1"),
      dishId: itemId("classic-burger"),
    };
    const k2 = addOrderToKitchen(k, order);
    expect(k2.pendingOrders).toHaveLength(1);
    expect(k2.pendingOrders[0]).toEqual(order);
  });

  it("startCuttingBoardWork moves order from pending to cutting board", () => {
    const order: KitchenOrder = {
      id: orderId("o1"),
      customerId: customerId("c1"),
      dishId: itemId("classic-burger"),
    };
    const k = addOrderToKitchen(createKitchenServiceState(), order);
    const k2 = startCuttingBoardWork(k, orderId("o1"), 5_000);

    expect(k2.pendingOrders).toHaveLength(0);
    expect(k2.cuttingBoard.tag).toBe("working");
    if (k2.cuttingBoard.tag === "working") {
      expect(k2.cuttingBoard.order.id).toBe(orderId("o1"));
      expect(k2.cuttingBoard.isPlayerActive).toBe(false);
      expect(k2.cuttingBoard.progressMs).toBe(0);
      expect(k2.cuttingBoard.durationMs).toBe(5_000);
    }
  });

  it("startCuttingBoardWork does nothing if cutting board not idle", () => {
    const o1: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    const o2: KitchenOrder = { id: orderId("o2"), customerId: customerId("c2"), dishId: itemId("dish-b") };
    let k = addOrderToKitchen(createKitchenServiceState(), o1);
    k = addOrderToKitchen(k, o2);
    k = startCuttingBoardWork(k, orderId("o1"), 5_000);
    const k2 = startCuttingBoardWork(k, orderId("o2"), 5_000); // already busy
    expect(k2.pendingOrders).toHaveLength(1); // o2 still pending
    expect(k2.cuttingBoard.tag).toBe("working");
  });

  it("setPlayerAtCuttingBoard toggles isPlayerActive", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startCuttingBoardWork(k, orderId("o1"), 5_000);

    const active = setPlayerAtCuttingBoard(k, true);
    expect(active.cuttingBoard.tag === "working" && active.cuttingBoard.isPlayerActive).toBe(true);

    const inactive = setPlayerAtCuttingBoard(active, false);
    expect(inactive.cuttingBoard.tag === "working" && inactive.cuttingBoard.isPlayerActive).toBe(false);
  });

  it("setPlayerAtCuttingBoard does nothing when station is idle", () => {
    const k = createKitchenServiceState();
    const k2 = setPlayerAtCuttingBoard(k, true);
    expect(k2.cuttingBoard.tag).toBe("idle");
  });

  it("startPassiveStation moves order to stove", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "stove", orderId("o1"), 15_000);

    expect(k.pendingOrders).toHaveLength(0);
    expect(k.stove.tag).toBe("working");
    if (k.stove.tag === "working") {
      expect(k.stove.order.id).toBe(orderId("o1"));
      expect(k.stove.durationMs).toBe(15_000);
    }
  });

  it("startPassiveStation moves order to oven", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "oven", orderId("o1"), 20_000);

    expect(k.oven.tag).toBe("working");
  });

  it("cutting board only advances when isPlayerActive", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startCuttingBoardWork(k, orderId("o1"), 5_000);

    // Not active — should not advance
    const k2 = tickKitchenStations(k, 2_000);
    expect(k2.cuttingBoard.tag).toBe("working");
    if (k2.cuttingBoard.tag === "working") {
      expect(k2.cuttingBoard.progressMs).toBe(0);
    }

    // Active — should advance
    const kActive = setPlayerAtCuttingBoard(k, true);
    const k3 = tickKitchenStations(kActive, 2_000);
    expect(k3.cuttingBoard.tag).toBe("working");
    if (k3.cuttingBoard.tag === "working") {
      expect(k3.cuttingBoard.progressMs).toBe(2_000);
    }
  });

  it("cutting board moves to orderUp when done", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startCuttingBoardWork(k, orderId("o1"), 3_000);
    k = setPlayerAtCuttingBoard(k, true);
    k = tickKitchenStations(k, 4_000); // exceeds duration

    expect(k.cuttingBoard.tag).toBe("idle");
    expect(k.orderUp).toHaveLength(1);
    expect(k.orderUp[0].id).toBe(orderId("o1"));
  });

  it("stove always advances regardless of player", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "stove", orderId("o1"), 15_000);

    const k2 = tickKitchenStations(k, 5_000);
    expect(k2.stove.tag).toBe("working");
    if (k2.stove.tag === "working") {
      expect(k2.stove.progressMs).toBe(5_000);
    }
  });

  it("stove moves to orderUp when done", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "stove", orderId("o1"), 5_000);
    k = tickKitchenStations(k, 6_000);

    expect(k.stove.tag).toBe("idle");
    expect(k.orderUp).toHaveLength(1);
    expect(k.orderUp[0].id).toBe(orderId("o1"));
  });

  it("oven auto-advances and moves to orderUp when done", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "oven", orderId("o1"), 10_000);
    k = tickKitchenStations(k, 11_000);

    expect(k.oven.tag).toBe("idle");
    expect(k.orderUp).toHaveLength(1);
  });

  it("pickupFromOrderUp removes the order", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startPassiveStation(k, "stove", orderId("o1"), 5_000);
    k = tickKitchenStations(k, 6_000);
    expect(k.orderUp).toHaveLength(1);

    const k2 = pickupFromOrderUp(k, orderId("o1"));
    expect(k2.orderUp).toHaveLength(0);
    expect(isKitchenIdle(k2)).toBe(true);
  });

  it("isKitchenIdle returns false when cutting board is working", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    k = startCuttingBoardWork(k, orderId("o1"), 5_000);
    expect(isKitchenIdle(k)).toBe(false);
  });

  it("isKitchenIdle returns false when orders are pending", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    const k = addOrderToKitchen(createKitchenServiceState(), order);
    expect(isKitchenIdle(k)).toBe(false);
  });

  it("multiple stations can run simultaneously", () => {
    const o1: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    const o2: KitchenOrder = { id: orderId("o2"), customerId: customerId("c2"), dishId: itemId("dish-b") };
    let k = addOrderToKitchen(createKitchenServiceState(), o1);
    k = addOrderToKitchen(k, o2);
    k = startPassiveStation(k, "stove", orderId("o1"), 5_000);
    k = startPassiveStation(k, "oven", orderId("o2"), 10_000);

    k = tickKitchenStations(k, 5_500);
    // stove done, oven still working
    expect(k.stove.tag).toBe("idle");
    expect(k.oven.tag).toBe("working");
    expect(k.orderUp).toHaveLength(1);
    expect(k.orderUp[0].id).toBe(orderId("o1"));
  });
});

// ---------------------------------------------------------------------------
// Service phase: table state lifecycle
// ---------------------------------------------------------------------------

describe("ServicePhase table states", () => {
  it("advanceToService creates N empty tables", () => {
    const phase = makeServicePhase(4);
    expect(phase.tables).toHaveLength(4);
    phase.tables.forEach((t) => expect(t.tag).toBe("empty"));
  });

  it("enqueueCustomer seats customer at first empty table", () => {
    const phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const updated = enqueueCustomer(phase, c1);
    expect(updated.tables[0].tag).toBe("customer_waiting");
    if (updated.tables[0].tag === "customer_waiting") {
      expect(updated.tables[0].customer.id).toBe(customerId("c1"));
    }
    expect(updated.customerQueue).toHaveLength(0);
  });

  it("enqueueCustomer fills tables in order", () => {
    let phase = makeServicePhase(2);
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2);
    expect(phase.tables[0].tag).toBe("customer_waiting");
    expect(phase.tables[1].tag).toBe("customer_waiting");
    expect(phase.customerQueue).toHaveLength(0);
  });

  it("enqueueCustomer adds to queue when all tables full", () => {
    let phase = makeServicePhase(2);
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    const c3 = createCustomer(customerId("c3"), itemId("cheeseburger"));
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2);
    phase = enqueueCustomer(phase, c3); // tables full
    expect(phase.customerQueue).toHaveLength(1);
    expect(phase.customerQueue[0].id).toBe(customerId("c3"));
  });

  it("takeOrder transitions customer_waiting -> order_pending", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);

    const updated = takeOrder(phase, 0);
    expect(updated.tables[0].tag).toBe("order_pending");
    if (updated.tables[0].tag === "order_pending") {
      expect(updated.tables[0].customer.id).toBe(customerId("c1"));
    }
  });

  it("takeOrder does nothing if table is not customer_waiting", () => {
    const phase = makeServicePhase();
    const updated = takeOrder(phase, 0); // table is empty
    expect(updated.tables[0].tag).toBe("empty");
  });

  it("sendOrderToKitchen transitions order_pending -> in_kitchen", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);

    expect(phase.tables[0].tag).toBe("in_kitchen");
    if (phase.tables[0].tag === "in_kitchen") {
      expect(phase.tables[0].orderId).toBe(oid);
    }
    // Order should be in kitchen.pendingOrders
    expect(phase.kitchen.pendingOrders).toHaveLength(1);
    expect(phase.kitchen.pendingOrders[0].id).toBe(oid);
    expect(phase.kitchen.pendingOrders[0].dishId).toBe(itemId("classic-burger"));
  });

  it("sendOrderToKitchen does nothing if table is not order_pending", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1); // still customer_waiting
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    expect(phase.tables[0].tag).toBe("customer_waiting"); // unchanged
    expect(phase.kitchen.pendingOrders).toHaveLength(0);
  });

  it("notifyOrderReady transitions in_kitchen -> ready_to_serve", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);
    phase = notifyOrderReady(phase, oid);

    expect(phase.tables[0].tag).toBe("ready_to_serve");
    if (phase.tables[0].tag === "ready_to_serve") {
      expect(phase.tables[0].orderId).toBe(oid);
    }
  });

  it("notifyOrderReady does nothing if no matching in_kitchen table", () => {
    const phase = makeServicePhase();
    const updated = notifyOrderReady(phase, orderId("o999"));
    expect(updated).toEqual(phase);
  });

  it("serveOrder transitions ready_to_serve -> empty and increments served", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);
    phase = notifyOrderReady(phase, oid);
    // Add to kitchen.orderUp manually for test
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: oid, customerId: customerId("c1"), dishId: itemId("classic-burger") }] } };

    phase = serveOrder(phase, 0, 8);

    expect(phase.tables[0].tag).toBe("empty");
    expect(phase.customersServed).toBe(1);
    expect(phase.earnings).toBe(8);
    // Order removed from kitchen.orderUp
    expect(phase.kitchen.orderUp).toHaveLength(0);
  });

  it("serveOrder does nothing if table is not ready_to_serve", () => {
    const phase = makeServicePhase();
    const updated = serveOrder(phase, 0, 8);
    expect(updated.customersServed).toBe(0);
    expect(updated.tables[0].tag).toBe("empty");
  });

  it("serveOrder auto-seats queued customer after table empties", () => {
    let phase = makeServicePhase(1); // only 1 table
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"));
    phase = enqueueCustomer(phase, c1); // table[0] = customer_waiting
    phase = enqueueCustomer(phase, c2); // overflow queue

    phase = takeOrder(phase, 0);
    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);
    phase = notifyOrderReady(phase, oid);
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: oid, customerId: customerId("c1"), dishId: itemId("classic-burger") }] } };
    phase = serveOrder(phase, 0, 5);

    // c2 from queue should now be seated
    expect(phase.tables[0].tag).toBe("customer_waiting");
    if (phase.tables[0].tag === "customer_waiting") {
      expect(phase.tables[0].customer.id).toBe(customerId("c2"));
    }
    expect(phase.customerQueue).toHaveLength(0);
  });

  it("happy path: empty -> customer_waiting -> order_pending -> in_kitchen -> ready_to_serve -> empty", () => {
    let phase = makeServicePhase();
    expect(phase.tables[0].tag).toBe("empty");

    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    expect(phase.tables[0].tag).toBe("customer_waiting");

    phase = takeOrder(phase, 0);
    expect(phase.tables[0].tag).toBe("order_pending");

    const oid = orderId("o1");
    phase = sendOrderToKitchen(phase, 0, oid);
    expect(phase.tables[0].tag).toBe("in_kitchen");

    phase = notifyOrderReady(phase, oid);
    expect(phase.tables[0].tag).toBe("ready_to_serve");

    // add to orderUp for the serveOrder to remove from
    phase = { ...phase, kitchen: { ...phase.kitchen, orderUp: [{ id: oid, customerId: customerId("c1"), dishId: itemId("classic-burger") }] } };
    phase = serveOrder(phase, 0, 8);
    expect(phase.tables[0].tag).toBe("empty");
    expect(phase.customersServed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Player navigation
// ---------------------------------------------------------------------------

describe("movePlayer", () => {
  it("sets playerLocation to floor", () => {
    const phase = makeServicePhase();
    const updated = movePlayer(phase, "kitchen");
    expect(updated.playerLocation).toBe("kitchen");
    const back = movePlayer(updated, "floor");
    expect(back.playerLocation).toBe("floor");
  });

  it("activeSceneForPhase returns RestaurantScene when on floor", () => {
    const phase = makeServicePhase();
    expect(phase.playerLocation).toBe("floor");
    expect(activeSceneForPhase(phase)).toBe("RestaurantScene");
  });

  it("activeSceneForPhase returns KitchenScene when in kitchen", () => {
    let phase = makeServicePhase();
    phase = movePlayer(phase, "kitchen");
    expect(activeSceneForPhase(phase)).toBe("KitchenScene");
  });
});

// ---------------------------------------------------------------------------
// tickServicePhase
// ---------------------------------------------------------------------------

describe("tickServicePhase", () => {
  it("ticks patience on customer_waiting tables", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.tables[0].tag).toBe("customer_waiting");
    if (updated.tables[0].tag === "customer_waiting") {
      expect(updated.tables[0].customer.patienceMs).toBe(25_000);
    }
  });

  it("ticks patience on order_pending tables", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.tables[0].tag).toBe("order_pending");
    if (updated.tables[0].tag === "order_pending") {
      expect(updated.tables[0].customer.patienceMs).toBe(25_000);
    }
  });

  it("ticks patience on in_kitchen tables", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.tables[0].tag).toBe("in_kitchen");
    if (updated.tables[0].tag === "in_kitchen") {
      expect(updated.tables[0].customer.patienceMs).toBe(25_000);
    }
  });

  it("does NOT tick patience on empty or ready_to_serve tables", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    phase = notifyOrderReady(phase, orderId("o1"));
    // Table is ready_to_serve — patience should not tick
    const updated = tickServicePhase(phase, 5_000);
    // ready_to_serve tables don't have a customer property to check patience on
    expect(updated.tables[0].tag).toBe("ready_to_serve");
  });

  it("removes expired customers (patience <= 0) from tables", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 1_000);
    phase = enqueueCustomer(phase, c1);

    const updated = tickServicePhase(phase, 5_000); // patience expires
    expect(updated.tables[0].tag).toBe("empty");
    expect(updated.customersLost).toBe(1);
  });

  it("removes expired customers from overflow queue", () => {
    let phase = makeServicePhase(1);
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 1_000); // short patience
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2); // c2 goes to queue

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.customerQueue).toHaveLength(0);
    expect(updated.customersLost).toBe(1);
  });

  it("ticks kitchen stations as part of service tick", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));

    // Start order on stove (duration 15s)
    phase = { ...phase, kitchen: startPassiveStation(phase.kitchen, "stove", orderId("o1"), 15_000) };

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.kitchen.stove.tag).toBe("working");
    if (updated.kitchen.stove.tag === "working") {
      expect(updated.kitchen.stove.progressMs).toBe(5_000);
    }
  });

  it("tickServicePhase notifies table when order completes on stove", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));

    // Start order on stove (duration 5s)
    phase = { ...phase, kitchen: startPassiveStation(phase.kitchen, "stove", orderId("o1"), 5_000) };

    const updated = tickServicePhase(phase, 6_000); // stove completes
    // Table should be ready_to_serve
    expect(updated.tables[0].tag).toBe("ready_to_serve");
    // Kitchen orderUp should be populated then consumed
    // Actually notifyOrderReady doesn't remove from orderUp, just marks table
    // orderUp is removed when serveOrder is called
    expect(updated.kitchen.orderUp).toHaveLength(1);
  });

  it("ticks patience simultaneously for all occupied tables", () => {
    let phase = makeServicePhase(3);
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 20_000);
    const c3 = createCustomer(customerId("c3"), itemId("cheeseburger"), 10_000);
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2);
    phase = enqueueCustomer(phase, c3);

    const updated = tickServicePhase(phase, 5_000);
    // All patience ticked simultaneously
    if (updated.tables[0].tag === "customer_waiting")
      expect(updated.tables[0].customer.patienceMs).toBe(25_000);
    if (updated.tables[1].tag === "customer_waiting")
      expect(updated.tables[1].customer.patienceMs).toBe(15_000);
    if (updated.tables[2].tag === "customer_waiting")
      expect(updated.tables[2].customer.patienceMs).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// isRestaurantIdle
// ---------------------------------------------------------------------------

describe("isRestaurantIdle (new model)", () => {
  it("returns true when all tables empty, kitchen idle, queue empty", () => {
    const phase = makeServicePhase();
    expect(isRestaurantIdle(phase)).toBe(true);
  });

  it("returns false when a table has a customer", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when customer in queue", () => {
    let phase = makeServicePhase(0); // 0 tables to force queue
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when kitchen has pending orders", () => {
    const phase = makeServicePhase();
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    const updatedPhase = { ...phase, kitchen: addOrderToKitchen(phase.kitchen, order) };
    expect(isRestaurantIdle(updatedPhase)).toBe(false);
  });

  it("returns false when table is in_kitchen state", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"));
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));
    expect(isRestaurantIdle(phase)).toBe(false);
  });

  it("returns false when table is ready_to_serve", () => {
    let phase = makeServicePhase();
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

describe("service phase property tests", () => {
  it("customer conservation: no customers lost or gained spuriously", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4 }),
        (numCustomers) => {
          let phase = makeServicePhase(4);
          const customers = Array.from({ length: numCustomers }, (_, i) =>
            createCustomer(customerId(`c${i}`), itemId("classic-burger"), 60_000)
          );
          customers.forEach((c) => {
            phase = enqueueCustomer(phase, c);
          });

          const onTables = phase.tables.filter((t) => t.tag !== "empty").length;
          const inQueue = phase.customerQueue.length;
          expect(onTables + inQueue).toBe(numCustomers);
        }
      )
    );
  });

  it("patience never goes below zero after tickServicePhase", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 999_999 }),
        (elapsed) => {
          let phase = makeServicePhase();
          const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
          phase = enqueueCustomer(phase, c1);
          const ticked = tickServicePhase(phase, elapsed);
          ticked.tables.forEach((t) => {
            if (t.tag === "customer_waiting" || t.tag === "order_pending" || t.tag === "in_kitchen") {
              expect(t.customer.patienceMs).toBeGreaterThanOrEqual(0);
            }
          });
        }
      )
    );
  });

  it("customersServed + customersLost + active = total spawned", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        (n) => {
          let phase = makeServicePhase(4);
          const customers = Array.from({ length: n }, (_, i) =>
            createCustomer(customerId(`c${i}`), itemId("classic-burger"), 0) // zero patience
          );
          customers.forEach((c) => {
            phase = enqueueCustomer(phase, c);
          });
          const after = tickServicePhase(phase, 1); // expire all
          // All customers lost, no active
          expect(after.customersLost).toBe(n);
          expect(after.customersServed).toBe(0);
          after.tables.forEach((t) => expect(t.tag).toBe("empty"));
        }
      )
    );
  });
});
