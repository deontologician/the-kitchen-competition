import { type TableLayout, createTableLayout } from "./tables";

export interface Customer {
  readonly id: string;
  readonly dishId: string;
}

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly dishId: string;
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
      readonly customerQueue: ReadonlyArray<Customer>;
      readonly tableLayout: TableLayout;
    }
  | {
      readonly tag: "day_end";
      readonly customersServed: number;
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

const COINS_PER_CUSTOMER = 5;

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
    customerQueue: [],
    tableLayout: createTableLayout(tables),
  },
});

export const advanceToDayEnd = (cycle: DayCycle): DayCycle => {
  const served =
    cycle.phase.tag === "service" ? cycle.phase.customersServed : 0;
  return {
    ...cycle,
    phase: {
      tag: "day_end",
      customersServed: served,
      earnings: calculateEarnings(served),
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
  orderId: string,
  dishId: string
): ServicePhase => {
  if (phase.subPhase.tag !== "taking_order") return phase;
  return {
    ...phase,
    subPhase: {
      tag: "cooking",
      order: { id: orderId, customerId: phase.subPhase.customer.id, dishId },
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

export const finishServing = (phase: ServicePhase): ServicePhase => {
  if (phase.subPhase.tag !== "serving") return phase;
  return {
    ...phase,
    subPhase: { tag: "waiting_for_customer" },
    customersServed: phase.customersServed + 1,
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

export const calculateEarnings = (customersServed: number): number =>
  customersServed * COINS_PER_CUSTOMER;
