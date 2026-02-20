import type { ItemId } from "./branded";
import type { RecipeInput } from "./recipes";
import { resolveRecipeChain, totalRawIngredients, totalRecipeTime } from "./recipes";
import { menuFor, pickRandomDish } from "./menu";
import type { RestaurantType } from "./save-slots";
import { difficultyForDay } from "./difficulty";
import { findItem } from "./items";
import { createWallet, addCoins, spendCoins } from "./wallet";
import type { Wallet } from "./wallet";

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────

export type SeededRng = () => number;

export const createRng = (seed: number): SeededRng => {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ── Dish Economics ─────────────────────────────────────────────────────────

export interface DishEconomics {
  readonly dishId: ItemId;
  readonly sellPrice: number;
  readonly rawCost: number;
  readonly profit: number;
  readonly rawIngredients: ReadonlyArray<RecipeInput>;
  readonly prepTimeMs: number;
}

export const analyzeDish = (
  dishId: ItemId,
  sellPrice: number
): DishEconomics | undefined => {
  const chain = resolveRecipeChain(dishId);
  if (chain === undefined) return undefined;

  const raws = totalRawIngredients(chain);
  const rawCost = raws.reduce((sum, inp) => {
    const item = findItem(inp.itemId);
    return sum + (item?.cost ?? 0) * inp.quantity;
  }, 0);
  const prepTimeMs = totalRecipeTime(chain);

  return { dishId, sellPrice, rawCost, profit: sellPrice - rawCost, rawIngredients: raws, prepTimeMs };
};

export const analyzeMenu = (type: RestaurantType): ReadonlyArray<DishEconomics> =>
  menuFor(type).items.flatMap((mi) => {
    const result = analyzeDish(mi.dishId, mi.sellPrice);
    return result !== undefined ? [result] : [];
  });

// ── Buying Strategies ─────────────────────────────────────────────────────

export interface DishTarget {
  readonly dishId: ItemId;
  readonly quantity: number;
}

export type BuyingStrategy = (
  budget: number,
  type: RestaurantType,
) => ReadonlyArray<DishTarget>;

const buyInOrder = (
  dishes: ReadonlyArray<DishEconomics>,
  budget: number,
): ReadonlyArray<DishTarget> => {
  const counts = new Map<ItemId, number>();
  let remaining = budget;

  let bought = true;
  while (bought) {
    bought = false;
    for (const dish of dishes) {
      if (dish.rawCost <= remaining) {
        counts.set(dish.dishId, (counts.get(dish.dishId) ?? 0) + 1);
        remaining -= dish.rawCost;
        bought = true;
      }
    }
  }

  return [...counts.entries()].map(([dishId, quantity]) => ({ dishId, quantity }));
};

export const naiveStrategy: BuyingStrategy = (budget, type) => {
  const menu = analyzeMenu(type);
  return buyInOrder(menu, budget);
};

export const cheapestFirstStrategy: BuyingStrategy = (budget, type) => {
  const menu = analyzeMenu(type);
  const sorted = [...menu].sort((a, b) => a.rawCost - b.rawCost);
  return buyInOrder(sorted, budget);
};

export const profitFirstStrategy: BuyingStrategy = (budget, type) => {
  const menu = analyzeMenu(type);
  const sorted = [...menu].sort((a, b) => b.profit - a.profit);
  return buyInOrder(sorted, budget);
};

// ── Day Simulation ────────────────────────────────────────────────────────

export interface DayReport {
  readonly day: number;
  readonly walletBefore: number;
  readonly grocerySpend: number;
  readonly dishesPrepped: number;
  readonly customersArrived: number;
  readonly customersServed: number;
  readonly customersLost: number;
  readonly revenue: number;
  readonly walletAfter: number;
}

const PREP_BUDGET_MS = 30_000;
const SERVICE_BUDGET_MS = 120_000;
const COOK_TO_ORDER_MS = 2_000;

export const simulateDay = (
  day: number,
  coins: number,
  type: RestaurantType,
  strategy: BuyingStrategy,
  rng: SeededRng,
): DayReport => {
  const menu = analyzeMenu(type);
  const menuByDish = new Map(menu.map((d) => [d.dishId, d]));

  // 1. Grocery — buy dish targets
  const targets = strategy(coins, type);
  const grocerySpend = targets.reduce((sum, t) => {
    const dish = menuByDish.get(t.dishId);
    return sum + (dish?.rawCost ?? 0) * t.quantity;
  }, 0);

  // 2. Kitchen Prep — execute dishes within time budget
  let prepTimeRemaining = PREP_BUDGET_MS;
  const preppedCounts = new Map<ItemId, number>();
  const unpreppedCounts = new Map<ItemId, number>();
  // Process dishes in target order, one at a time
  for (const target of targets) {
    const dish = menuByDish.get(target.dishId);
    if (dish === undefined) continue;
    for (let i = 0; i < target.quantity; i++) {
      if (dish.prepTimeMs <= prepTimeRemaining) {
        prepTimeRemaining -= dish.prepTimeMs;
        preppedCounts.set(dish.dishId, (preppedCounts.get(dish.dishId) ?? 0) + 1);
      } else {
        unpreppedCounts.set(dish.dishId, (unpreppedCounts.get(dish.dishId) ?? 0) + 1);
      }
    }
  }
  const dishesPrepped = [...preppedCounts.values()].reduce((a, b) => a + b, 0);

  // 3. Service — serve customers from queue
  const difficulty = difficultyForDay(day);
  const avgSpawnMs = (difficulty.customerSpawnMinMs + difficulty.customerSpawnMaxMs) / 2;
  const customersArrived = Math.min(
    difficulty.maxCustomersPerDay,
    Math.max(1, Math.floor(SERVICE_BUDGET_MS / avgSpawnMs)),
  );

  let served = 0;
  let lost = 0;
  let revenue = 0;
  let serviceTimeUsed = 0;

  for (let c = 0; c < customersArrived; c++) {
    const ordered = pickRandomDish(type, rng());
    const available = preppedCounts.get(ordered.dishId) ?? 0;
    if (available > 0) {
      // Serve from pre-prepped inventory (instant)
      preppedCounts.set(ordered.dishId, available - 1);
      revenue += ordered.sellPrice;
      served++;
    } else if (
      (unpreppedCounts.get(ordered.dishId) ?? 0) > 0 &&
      serviceTimeUsed + COOK_TO_ORDER_MS <= SERVICE_BUDGET_MS
    ) {
      // Cook to order from unprepped stock (costs service time)
      unpreppedCounts.set(ordered.dishId, (unpreppedCounts.get(ordered.dishId) ?? 0) - 1);
      serviceTimeUsed += COOK_TO_ORDER_MS;
      revenue += ordered.sellPrice;
      served++;
    } else {
      lost++;
    }
  }

  return {
    day,
    walletBefore: coins,
    grocerySpend,
    dishesPrepped,
    customersArrived,
    customersServed: served,
    customersLost: lost,
    revenue,
    walletAfter: coins - grocerySpend + revenue,
  };
};

// ── Multi-Day Simulation ──────────────────────────────────────────────────

export interface SimulationResult {
  readonly restaurantType: RestaurantType;
  readonly strategyName: string;
  readonly days: ReadonlyArray<DayReport>;
  readonly finalWallet: number;
  readonly wentBankrupt: boolean;
  readonly bankruptDay: number | undefined;
}

export interface SimulationOptions {
  readonly restaurantType: RestaurantType;
  readonly strategy: BuyingStrategy;
  readonly strategyName: string;
  readonly days: number;
  readonly seed: number;
  readonly startingCoins: number;
}

export const runSimulation = (opts: SimulationOptions): SimulationResult => {
  const rng = createRng(opts.seed);
  const reports: DayReport[] = [];
  let coins = opts.startingCoins;
  let bankruptDay: number | undefined;

  for (let d = 1; d <= opts.days; d++) {
    const report = simulateDay(d, coins, opts.restaurantType, opts.strategy, rng);
    reports.push(report);
    coins = report.walletAfter;
    if (coins <= 0 && bankruptDay === undefined) {
      bankruptDay = d;
    }
  }

  return {
    restaurantType: opts.restaurantType,
    strategyName: opts.strategyName,
    days: reports,
    finalWallet: coins,
    wentBankrupt: bankruptDay !== undefined,
    bankruptDay,
  };
};
