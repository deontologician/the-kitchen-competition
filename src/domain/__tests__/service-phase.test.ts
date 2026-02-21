/**
 * Tests for the FOH/BOH service phase model.
 * Uses zone-based KitchenServiceState with zones: KitchenZoneState.
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
  placeIngredientInZone,
  activateCuttingBoard,
  flipStove,
  assembleOrder,
  tickKitchenService,
  isKitchenIdle,
  pickupFromOrderUp,
  type KitchenOrder,
} from "../kitchen-service";
import {
  createInventory,
  addItem,
  type Inventory,
} from "../inventory";
import {
  placeItemInZone,
  type KitchenZone,
  type ZoneInteraction,
} from "../kitchen-zones";

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

/** Force a zone slot into phase.kitchen.zones for testing without inventory. */
const forceZoneSlot = (
  phase: ServicePhase,
  zone: KitchenZone,
  outputItemId: string,
  durationMs: number,
  interaction: ZoneInteraction
): ServicePhase => {
  const newZones = placeItemInZone(phase.kitchen.zones, zone, itemId(outputItemId), durationMs, interaction);
  if (newZones === undefined) throw new Error(`Zone ${zone} is full`);
  return { ...phase, kitchen: { ...phase.kitchen, zones: newZones } };
};

// ---------------------------------------------------------------------------
// Kitchen service state (standalone)
// ---------------------------------------------------------------------------

describe("KitchenServiceState", () => {
  it("createKitchenServiceState returns empty state", () => {
    const k = createKitchenServiceState();
    expect(k.pendingOrders).toEqual([]);
    expect(k.orderUp).toEqual([]);
    expect(isKitchenIdle(k)).toBe(true);
    // zones exist
    expect(k.zones).toBeDefined();
    expect(k.zones.cuttingBoard).toHaveLength(1);
    expect(k.zones.stove).toHaveLength(3);
    expect(k.zones.oven).toHaveLength(2);
    expect(k.zones.ready).toHaveLength(0);
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

  it("placeIngredientInZone consumes from inventory and places in zone", () => {
    const k = createKitchenServiceState();
    let inv = createInventory();
    inv = addItem(inv, itemId("beef-patty"), Date.now());

    const result = placeIngredientInZone(k, inv, itemId("beef-patty"), itemId("grilled-patty"), "stove", 5000, "flip");
    expect(result).toBeDefined();
    expect(result!.kitchen.zones.stove[0].tag).toBe("working");
    // input consumed from inventory
    expect(result!.inventory.items.filter((i) => i.itemId === itemId("beef-patty"))).toHaveLength(0);
  });

  it("placeIngredientInZone returns undefined if input not in inventory", () => {
    const k = createKitchenServiceState();
    const inv = createInventory(); // empty
    const result = placeIngredientInZone(k, inv, itemId("beef-patty"), itemId("grilled-patty"), "stove", 5000, "flip");
    expect(result).toBeUndefined();
  });

  it("placeIngredientInZone returns undefined if zone is full", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    const now = Date.now();
    // Fill cutting board (capacity=1)
    inv = addItem(inv, itemId("lettuce"), now);
    inv = addItem(inv, itemId("tomato"), now);

    const r1 = placeIngredientInZone(k, inv, itemId("lettuce"), itemId("shredded-lettuce"), "cuttingBoard", 2000, "hold");
    expect(r1).toBeDefined();
    k = r1!.kitchen;
    inv = r1!.inventory;

    const r2 = placeIngredientInZone(k, inv, itemId("tomato"), itemId("sliced-tomato"), "cuttingBoard", 2000, "hold");
    expect(r2).toBeUndefined();
  });

  it("activateCuttingBoard delegates to activateCuttingBoardSlot", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    inv = addItem(inv, itemId("lettuce"), Date.now());
    const r = placeIngredientInZone(k, inv, itemId("lettuce"), itemId("shredded-lettuce"), "cuttingBoard", 2000, "hold");
    expect(r).toBeDefined();
    k = r!.kitchen;

    const activated = activateCuttingBoard(k, 0, true);
    const slot = activated.zones.cuttingBoard[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.isActive).toBe(true);
    }
  });

  it("flipStove delegates to flipStoveSlot", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    inv = addItem(inv, itemId("beef-patty"), Date.now());
    const r = placeIngredientInZone(k, inv, itemId("beef-patty"), itemId("grilled-patty"), "stove", 5000, "flip");
    expect(r).toBeDefined();
    k = r!.kitchen;

    // Tick to needs_flip
    k = tickKitchenService(k, 2500);
    expect(k.zones.stove[0].tag).toBe("needs_flip");

    const flipped = flipStove(k, 0);
    expect(flipped.zones.stove[0].tag).toBe("working");
  });

  it("tickKitchenService advances zones and produces ready items", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    inv = addItem(inv, itemId("smoked-pork"), Date.now());
    // Place in oven (auto)
    const r = placeIngredientInZone(k, inv, itemId("smoked-pork"), itemId("smoked-pork"), "oven", 1000, "auto");
    expect(r).toBeDefined();
    k = r!.kitchen;

    k = tickKitchenService(k, 1001);
    expect(k.zones.ready).toContain(itemId("smoked-pork"));
  });

  it("assembleOrder takes ready + inventory items → orderUp", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    const now = Date.now();
    const oid = orderId("o1");

    // Add order
    const order: KitchenOrder = {
      id: oid,
      customerId: customerId("c1"),
      dishId: itemId("classic-burger"),
    };
    k = addOrderToKitchen(k, order);

    // classic-burger inputs: bun(raw), grilled-patty(prepped), shredded-lettuce(prepped), sliced-tomato(prepped)
    // Provide raw items in inventory
    inv = addItem(inv, itemId("bun"), now);
    // Provide prepped items in zones.ready (force them in)
    k = { ...k, zones: { ...k.zones, ready: [itemId("grilled-patty"), itemId("shredded-lettuce"), itemId("sliced-tomato")] } };

    const result = assembleOrder(k, inv, oid);
    expect(result).toBeDefined();
    expect(result!.kitchen.orderUp).toHaveLength(1);
    expect(result!.kitchen.orderUp[0].id).toBe(oid);
    // bun consumed from inventory
    expect(result!.inventory.items.filter((i) => i.itemId === itemId("bun"))).toHaveLength(0);
    // prepped items removed from ready
    expect(result!.kitchen.zones.ready).not.toContain(itemId("grilled-patty"));
    // order removed from pendingOrders
    expect(result!.kitchen.pendingOrders).toHaveLength(0);
  });

  it("assembleOrder returns undefined if components missing", () => {
    const k = createKitchenServiceState();
    const inv = createInventory(); // empty
    const oid = orderId("o1");
    const order: KitchenOrder = {
      id: oid,
      customerId: customerId("c1"),
      dishId: itemId("classic-burger"),
    };
    const k2 = addOrderToKitchen(k, order);

    const result = assembleOrder(k2, inv, oid);
    expect(result).toBeUndefined();
  });

  it("pickupFromOrderUp removes the order", () => {
    const oid = orderId("o1");
    const order: KitchenOrder = { id: oid, customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = addOrderToKitchen(createKitchenServiceState(), order);
    // Force to orderUp directly
    k = { ...k, orderUp: [order], pendingOrders: [] };
    expect(k.orderUp).toHaveLength(1);

    const k2 = pickupFromOrderUp(k, oid);
    expect(k2.orderUp).toHaveLength(0);
    expect(isKitchenIdle(k2)).toBe(true);
  });

  it("isKitchenIdle returns false when pendingOrders exist", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    const k = addOrderToKitchen(createKitchenServiceState(), order);
    expect(isKitchenIdle(k)).toBe(false);
  });

  it("isKitchenIdle returns false when zone has working slot", () => {
    let k = createKitchenServiceState();
    let inv = createInventory();
    inv = addItem(inv, itemId("beef-patty"), Date.now());
    const r = placeIngredientInZone(k, inv, itemId("beef-patty"), itemId("grilled-patty"), "stove", 5000, "flip");
    k = r!.kitchen;
    expect(isKitchenIdle(k)).toBe(false);
  });

  it("isKitchenIdle returns false when ready pile has items", () => {
    let k = createKitchenServiceState();
    k = { ...k, zones: { ...k.zones, ready: [itemId("grilled-patty")] } };
    expect(isKitchenIdle(k)).toBe(false);
  });

  it("isKitchenIdle returns false when orderUp has items", () => {
    const order: KitchenOrder = { id: orderId("o1"), customerId: customerId("c1"), dishId: itemId("dish-a") };
    let k = createKitchenServiceState();
    k = { ...k, orderUp: [order] };
    expect(isKitchenIdle(k)).toBe(false);
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
    const updated = tickServicePhase(phase, 5_000);
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
    const c2 = createCustomer(customerId("c2"), itemId("cheeseburger"), 1_000);
    phase = enqueueCustomer(phase, c1);
    phase = enqueueCustomer(phase, c2); // c2 goes to queue

    const updated = tickServicePhase(phase, 5_000);
    expect(updated.customerQueue).toHaveLength(0);
    expect(updated.customersLost).toBe(1);
  });

  it("ticks kitchen zones as part of service tick", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));

    // Force a zone slot (auto oven) to test zone ticking
    phase = forceZoneSlot(phase, "oven", "smoked-pork", 15_000, "auto");

    const updated = tickServicePhase(phase, 5_000);
    // Zone should have advanced
    const slot = updated.kitchen.zones.oven[0];
    expect(slot.tag).toBe("working");
    if (slot.tag === "working") {
      expect(slot.progressMs).toBe(5_000);
    }
  });

  it("tickServicePhase does NOT auto-notify table when zone item completes (notification is scene-driven)", () => {
    let phase = makeServicePhase();
    const c1 = createCustomer(customerId("c1"), itemId("classic-burger"), 30_000);
    phase = enqueueCustomer(phase, c1);
    phase = takeOrder(phase, 0);
    phase = sendOrderToKitchen(phase, 0, orderId("o1"));

    // Force a zone slot (auto oven, short duration)
    phase = forceZoneSlot(phase, "oven", "smoked-pork", 1_000, "auto");

    const updated = tickServicePhase(phase, 2_000); // zone completes
    // Table should still be in_kitchen (no auto-notification)
    expect(updated.tables[0].tag).toBe("in_kitchen");
    // Ready pile has the item
    expect(updated.kitchen.zones.ready).toContain(itemId("smoked-pork"));
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

  it("returns false when kitchen zones have items in ready pile", () => {
    let phase = makeServicePhase();
    phase = { ...phase, kitchen: { ...phase.kitchen, zones: { ...phase.kitchen.zones, ready: [itemId("grilled-patty")] } } };
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
          expect(after.customersLost).toBe(n);
          expect(after.customersServed).toBe(0);
          after.tables.forEach((t) => expect(t.tag).toBe("empty"));
        }
      )
    );
  });
});
