import type { CustomerId, OrderId, ItemId } from "./branded";
import {
  type KitchenServiceState,
  type KitchenOrder,
  createKitchenServiceState,
  addOrderToKitchen,
  pickupFromOrderUp,
  tickKitchenService,
  isKitchenIdle,
} from "./kitchen-service";

export interface Customer {
  readonly id: CustomerId;
  readonly dishId: ItemId;
  readonly patienceMs: number;
  readonly maxPatienceMs: number;
}

export const DEFAULT_PATIENCE_MS = 60_000;

export const createCustomer = (
  id: CustomerId,
  dishId: ItemId,
  patienceMs: number = DEFAULT_PATIENCE_MS
): Customer => ({
  id,
  dishId,
  patienceMs,
  maxPatienceMs: patienceMs,
});

export interface Order {
  readonly id: OrderId;
  readonly customerId: CustomerId;
  readonly dishId: ItemId;
}

// ---------------------------------------------------------------------------
// Table state (discriminated union per table)
// ---------------------------------------------------------------------------

export type TableState =
  | { readonly tag: "empty" }
  | { readonly tag: "customer_waiting"; readonly customer: Customer }
  | { readonly tag: "order_pending"; readonly customer: Customer }
  | {
      readonly tag: "in_kitchen";
      readonly customer: Customer;
      readonly orderId: OrderId;
    }
  | {
      readonly tag: "ready_to_serve";
      readonly customer: Customer;
      readonly orderId: OrderId;
    };

// ---------------------------------------------------------------------------
// Day phases (discriminated union)
// ---------------------------------------------------------------------------

export type Phase =
  | {
      readonly tag: "grocery";
      readonly remainingMs: number;
      readonly durationMs: number;
    }
  | {
      readonly tag: "kitchen_prep";
      readonly remainingMs: number;
      readonly durationMs: number;
    }
  | {
      readonly tag: "service";
      readonly remainingMs: number;
      readonly durationMs: number;
      readonly tables: ReadonlyArray<TableState>;
      readonly kitchen: KitchenServiceState;
      readonly playerLocation: "floor" | "kitchen";
      readonly customersServed: number;
      readonly customersLost: number;
      readonly earnings: number;
      readonly customerQueue: ReadonlyArray<Customer>;
    }
  | {
      readonly tag: "day_end";
      readonly customersServed: number;
      readonly customersLost: number;
      readonly earnings: number;
    };

// Extract service phase type for sub-phase functions
export type ServicePhase = Extract<Phase, { readonly tag: "service" }>;

// Phases that have a timer (everything except day_end)
export type TimedPhase = Exclude<Phase, { readonly tag: "day_end" }>;

export const isTimedPhase = (phase: Phase): phase is TimedPhase =>
  phase.tag !== "day_end";

export interface DayCycle {
  readonly day: number;
  readonly phase: Phase;
}

export interface PhaseDurations {
  readonly groceryMs: number;
  readonly kitchenPrepMs: number;
  readonly serviceMs: number;
}

export const defaultDurations: PhaseDurations = {
  groceryMs: 30_000,
  kitchenPrepMs: 30_000,
  serviceMs: 120_000,
};

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export const createDayCycle = (
  day: number,
  durations: PhaseDurations = defaultDurations
): DayCycle => ({
  day,
  phase: {
    tag: "grocery",
    remainingMs: durations.groceryMs,
    durationMs: durations.groceryMs,
  },
});

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export const tickTimer = (cycle: DayCycle, elapsedMs: number): DayCycle => {
  const { phase } = cycle;
  if (phase.tag === "day_end") return cycle;
  return {
    ...cycle,
    phase: {
      ...phase,
      remainingMs: Math.max(0, phase.remainingMs - elapsedMs),
    },
  };
};

export const isPhaseTimerExpired = (cycle: DayCycle): boolean => {
  const { phase } = cycle;
  if (phase.tag === "day_end") return false;
  return phase.remainingMs <= 0;
};

export const timerFraction = (phase: Phase): number => {
  if (phase.tag === "day_end") return 0;
  if (phase.durationMs === 0) return 0;
  return phase.remainingMs / phase.durationMs;
};

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

export const advanceToKitchenPrep = (
  cycle: DayCycle,
  durationMs: number
): DayCycle => ({
  ...cycle,
  phase: {
    tag: "kitchen_prep",
    remainingMs: durationMs,
    durationMs,
  },
});

export const advanceToService = (
  cycle: DayCycle,
  durationMs: number,
  tables: number = 4
): DayCycle => ({
  ...cycle,
  phase: {
    tag: "service",
    remainingMs: durationMs,
    durationMs,
    tables: Array.from({ length: tables }, (): TableState => ({ tag: "empty" })),
    kitchen: createKitchenServiceState(),
    playerLocation: "floor",
    customersServed: 0,
    customersLost: 0,
    earnings: 0,
    customerQueue: [],
  },
});

export const advanceToDayEnd = (cycle: DayCycle): DayCycle => {
  const served =
    cycle.phase.tag === "service" ? cycle.phase.customersServed : 0;
  const lost =
    cycle.phase.tag === "service" ? cycle.phase.customersLost : 0;
  const earned =
    cycle.phase.tag === "service" ? cycle.phase.earnings : 0;
  return {
    ...cycle,
    phase: {
      tag: "day_end",
      customersServed: served,
      customersLost: lost,
      earnings: earned,
    },
  };
};

export const advanceToNextDay = (
  cycle: DayCycle,
  durations: PhaseDurations = defaultDurations
): DayCycle => createDayCycle(cycle.day + 1, durations);

// ---------------------------------------------------------------------------
// Service phase: customer management
// ---------------------------------------------------------------------------

/** Seat a customer at the first empty table, or queue them if all tables full. */
export const enqueueCustomer = (
  phase: ServicePhase,
  customer: Customer
): ServicePhase => {
  const emptyIdx = phase.tables.findIndex((t) => t.tag === "empty");
  if (emptyIdx >= 0) {
    return {
      ...phase,
      tables: phase.tables.map((t, i) =>
        i === emptyIdx
          ? ({ tag: "customer_waiting", customer } as TableState)
          : t
      ),
    };
  }
  return { ...phase, customerQueue: [...phase.customerQueue, customer] };
};

/**
 * Serve a customer directly from pre-prepped inventory.
 * Valid from customer_waiting or order_pending states (dish already available).
 * Bypasses the kitchen stations entirely.
 */
export const serveDirectFromInventory = (
  phase: ServicePhase,
  tableId: number,
  dishEarnings: number
): ServicePhase => {
  const table = phase.tables[tableId];
  if (
    table === undefined ||
    (table.tag !== "customer_waiting" && table.tag !== "order_pending")
  )
    return phase;

  const tablesWithEmpty = phase.tables.map((t, i) =>
    i === tableId ? ({ tag: "empty" } as TableState) : t
  );
  const { tables: seatedTables, customerQueue: newQueue } = seatFromQueue(
    tablesWithEmpty,
    phase.customerQueue
  );

  return {
    ...phase,
    tables: seatedTables,
    customerQueue: newQueue,
    customersServed: phase.customersServed + 1,
    earnings: phase.earnings + dishEarnings,
  };
};

/** Take an order at a table: customer_waiting → order_pending. */
export const takeOrder = (
  phase: ServicePhase,
  tableId: number
): ServicePhase => {
  const table = phase.tables[tableId];
  if (table === undefined || table.tag !== "customer_waiting") return phase;
  return {
    ...phase,
    tables: phase.tables.map((t, i) =>
      i === tableId
        ? ({ tag: "order_pending", customer: table.customer } as TableState)
        : t
    ),
  };
};

/** Send an order to the kitchen: order_pending → in_kitchen. Adds to kitchen.pendingOrders. */
export const sendOrderToKitchen = (
  phase: ServicePhase,
  tableId: number,
  oid: OrderId
): ServicePhase => {
  const table = phase.tables[tableId];
  if (table === undefined || table.tag !== "order_pending") return phase;

  const kitchenOrder: KitchenOrder = {
    id: oid,
    customerId: table.customer.id,
    dishId: table.customer.dishId,
  };

  return {
    ...phase,
    tables: phase.tables.map((t, i) =>
      i === tableId
        ? ({
            tag: "in_kitchen",
            customer: table.customer,
            orderId: oid,
          } as TableState)
        : t
    ),
    kitchen: addOrderToKitchen(phase.kitchen, kitchenOrder),
  };
};

/** Called when an order appears in kitchen.orderUp: find matching in_kitchen table → ready_to_serve. */
export const notifyOrderReady = (
  phase: ServicePhase,
  oid: OrderId
): ServicePhase => {
  const tableIdx = phase.tables.findIndex(
    (t) => t.tag === "in_kitchen" && t.orderId === oid
  );
  if (tableIdx < 0) return phase;
  const table = phase.tables[tableIdx];
  if (table.tag !== "in_kitchen") return phase;
  return {
    ...phase,
    tables: phase.tables.map((t, i) =>
      i === tableIdx
        ? ({
            tag: "ready_to_serve",
            customer: table.customer,
            orderId: oid,
          } as TableState)
        : t
    ),
  };
};

/** Seat the next queued customer at a newly-emptied table, if available. */
const seatFromQueue = (
  tables: ReadonlyArray<TableState>,
  queue: ReadonlyArray<Customer>
): { tables: ReadonlyArray<TableState>; customerQueue: ReadonlyArray<Customer> } => {
  if (queue.length === 0) return { tables, customerQueue: queue };
  const emptyIdx = tables.findIndex((t) => t.tag === "empty");
  if (emptyIdx < 0) return { tables, customerQueue: queue };
  const [next, ...rest] = queue;
  return seatFromQueue(
    tables.map((t, i) =>
      i === emptyIdx ? ({ tag: "customer_waiting", customer: next } as TableState) : t
    ),
    rest
  );
};

/** Serve an order: ready_to_serve → empty, update earnings. Also removes from kitchen.orderUp. */
export const serveOrder = (
  phase: ServicePhase,
  tableId: number,
  dishEarnings: number
): ServicePhase => {
  const table = phase.tables[tableId];
  if (table === undefined || table.tag !== "ready_to_serve") return phase;

  const { orderId: oid } = table;
  const newKitchen = pickupFromOrderUp(phase.kitchen, oid);
  const tablesWithEmpty = phase.tables.map((t, i) =>
    i === tableId ? ({ tag: "empty" } as TableState) : t
  );

  const { tables: seatedTables, customerQueue: newQueue } = seatFromQueue(
    tablesWithEmpty,
    phase.customerQueue
  );

  return {
    ...phase,
    tables: seatedTables,
    customerQueue: newQueue,
    kitchen: newKitchen,
    customersServed: phase.customersServed + 1,
    earnings: phase.earnings + dishEarnings,
  };
};

/** Set the player's current location (floor or kitchen). */
export const movePlayer = (
  phase: ServicePhase,
  location: "floor" | "kitchen"
): ServicePhase => ({ ...phase, playerLocation: location });

// ---------------------------------------------------------------------------
// Ticking
// ---------------------------------------------------------------------------

/** Tick patience on all occupied table states. */
export const tickCustomerPatience = (
  phase: ServicePhase,
  elapsedMs: number
): ServicePhase => {
  const tickCustomer = (c: Customer): Customer => ({
    ...c,
    patienceMs: Math.max(0, c.patienceMs - elapsedMs),
  });

  return {
    ...phase,
    tables: phase.tables.map((t): TableState => {
      switch (t.tag) {
        case "customer_waiting":
          return { ...t, customer: tickCustomer(t.customer) };
        case "order_pending":
          return { ...t, customer: tickCustomer(t.customer) };
        case "in_kitchen":
          return { ...t, customer: tickCustomer(t.customer) };
        case "empty":
        case "ready_to_serve":
          return t;
        default: {
          const _exhaustive: never = t;
          return _exhaustive;
        }
      }
    }),
    customerQueue: phase.customerQueue.map((c) => tickCustomer(c)),
  };
};

/** Remove customers with expired patience from tables and queue. */
export const removeExpiredCustomers = (
  phase: ServicePhase
): ServicePhase => {
  let customersLost = phase.customersLost;
  const tables = phase.tables.map((t): TableState => {
    switch (t.tag) {
      case "customer_waiting":
      case "order_pending":
      case "in_kitchen":
        if (t.customer.patienceMs <= 0) {
          customersLost++;
          return { tag: "empty" };
        }
        return t;
      case "empty":
      case "ready_to_serve":
        return t;
      default: {
        const _exhaustive: never = t;
        return _exhaustive;
      }
    }
  });

  const expiredQueue = phase.customerQueue.filter((c) => c.patienceMs <= 0);
  const remainingQueue = phase.customerQueue.filter((c) => c.patienceMs > 0);
  customersLost += expiredQueue.length;

  const { tables: seatedTables, customerQueue: newQueue } = seatFromQueue(
    tables,
    remainingQueue
  );

  return {
    ...phase,
    tables: seatedTables,
    customerQueue: newQueue,
    customersLost,
  };
};

/**
 * Combined service phase tick:
 * 1. Tick all customer patience
 * 2. Remove expired customers
 * 3. Tick kitchen zones
 *
 * Note: table notification (in_kitchen → ready_to_serve) is scene-driven.
 * Call notifyOrderReady explicitly after assembleOrder.
 */
export const tickServicePhase = (
  phase: ServicePhase,
  delta: number
): ServicePhase => {
  // 1 + 2: patience + expiry
  const afterPatience = tickCustomerPatience(phase, delta);
  const afterExpiry = removeExpiredCustomers(afterPatience);

  // 3: kitchen zones
  const newKitchen = tickKitchenService(afterExpiry.kitchen, delta);

  return { ...afterExpiry, kitchen: newKitchen };
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export const isRestaurantIdle = (phase: ServicePhase): boolean =>
  phase.tables.every((t) => t.tag === "empty") &&
  isKitchenIdle(phase.kitchen) &&
  phase.customerQueue.length === 0;

export const activeSceneForPhase = (phase: Phase): string => {
  switch (phase.tag) {
    case "grocery":
      return "GroceryScene";
    case "kitchen_prep":
      return "KitchenScene";
    case "service":
      return phase.playerLocation === "kitchen"
        ? "KitchenScene"
        : "RestaurantScene";
    case "day_end":
      return "RestaurantScene";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
};
