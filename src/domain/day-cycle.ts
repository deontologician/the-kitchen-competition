import type { CustomerId, OrderId, ItemId } from "./branded";
import { type TableLayout, createTableLayout, unseatCustomer } from "./tables";

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

// Service sub-phases (discriminated union)
export type ServiceSubPhase =
  | { readonly tag: "waiting_for_customer" }
  | { readonly tag: "taking_order"; readonly customer: Customer }
  | { readonly tag: "cooking"; readonly order: Order }
  | { readonly tag: "serving"; readonly order: Order };

// Day phases (discriminated union)
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
      readonly subPhase: ServiceSubPhase;
      readonly customersServed: number;
      readonly customersLost: number;
      readonly earnings: number;
      readonly customerQueue: ReadonlyArray<Customer>;
      readonly tableLayout: TableLayout;
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
    subPhase: { tag: "waiting_for_customer" },
    customersServed: 0,
    customersLost: 0,
    earnings: 0,
    customerQueue: [],
    tableLayout: createTableLayout(tables),
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
// Service sub-phase transitions
// ---------------------------------------------------------------------------

export const enqueueCustomer = (
  phase: ServicePhase,
  customer: Customer
): ServicePhase => ({
  ...phase,
  customerQueue: [...phase.customerQueue, customer],
});

export const beginTakingOrder = (
  phase: ServicePhase
): ServicePhase | undefined => {
  if (phase.subPhase.tag !== "waiting_for_customer") return undefined;
  if (phase.customerQueue.length === 0) return undefined;
  const [next, ...rest] = phase.customerQueue;
  return {
    ...phase,
    subPhase: { tag: "taking_order", customer: next },
    customerQueue: rest,
  };
};

export const beginCooking = (
  phase: ServicePhase,
  id: OrderId,
  dishId: ItemId
): ServicePhase => {
  if (phase.subPhase.tag !== "taking_order") return phase;
  return {
    ...phase,
    subPhase: {
      tag: "cooking",
      order: { id, customerId: phase.subPhase.customer.id, dishId },
    },
  };
};

export const finishCooking = (phase: ServicePhase): ServicePhase => {
  if (phase.subPhase.tag !== "cooking") return phase;
  return {
    ...phase,
    subPhase: { tag: "serving", order: phase.subPhase.order },
  };
};

export const activeCustomerId = (phase: ServicePhase): CustomerId | undefined => {
  switch (phase.subPhase.tag) {
    case "taking_order":
      return phase.subPhase.customer.id;
    case "cooking":
      return phase.subPhase.order.customerId;
    case "serving":
      return phase.subPhase.order.customerId;
    case "waiting_for_customer":
      return undefined;
    default: {
      const _exhaustive: never = phase.subPhase;
      return _exhaustive;
    }
  }
};

export const abandonOrder = (phase: ServicePhase): ServicePhase => {
  if (phase.subPhase.tag === "taking_order") {
    return { ...phase, subPhase: { tag: "waiting_for_customer" } };
  }
  if (phase.subPhase.tag === "cooking") {
    return { ...phase, subPhase: { tag: "waiting_for_customer" } };
  }
  return phase;
};

export const finishServing = (
  phase: ServicePhase,
  dishEarnings: number
): ServicePhase => {
  if (phase.subPhase.tag !== "serving") return phase;
  return {
    ...phase,
    subPhase: { tag: "waiting_for_customer" },
    customersServed: phase.customersServed + 1,
    earnings: phase.earnings + dishEarnings,
  };
};

// ---------------------------------------------------------------------------
// Customer patience
// ---------------------------------------------------------------------------

export const tickCustomerPatience = (
  phase: ServicePhase,
  elapsedMs: number
): ServicePhase => ({
  ...phase,
  customerQueue: phase.customerQueue.map((c) => ({
    ...c,
    patienceMs: Math.max(0, c.patienceMs - elapsedMs),
  })),
});

export const removeExpiredCustomers = (
  phase: ServicePhase
): ServicePhase => {
  const expired = phase.customerQueue.filter((c) => c.patienceMs <= 0);
  const remaining = phase.customerQueue.filter((c) => c.patienceMs > 0);
  const updatedLayout = expired.reduce(
    (layout, c) => unseatCustomer(layout, c.id),
    phase.tableLayout
  );
  return {
    ...phase,
    customerQueue: remaining,
    tableLayout: updatedLayout,
    customersLost: phase.customersLost + expired.length,
  };
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export const activeSceneForPhase = (phase: Phase): string => {
  switch (phase.tag) {
    case "grocery":
      return "GroceryScene";
    case "kitchen_prep":
      return "KitchenScene";
    case "service":
      return phase.subPhase.tag === "cooking"
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
