export interface Leaderboard {
  readonly bestDayServed: number;
  readonly bestDayEarnings: number;
  readonly bestTotalEarnings: number;
  readonly totalCustomersServed: number;
  readonly totalDaysPlayed: number;
}

export interface DayResult {
  readonly served: number;
  readonly earnings: number;
}

export const createLeaderboard = (): Leaderboard => ({
  bestDayServed: 0,
  bestDayEarnings: 0,
  bestTotalEarnings: 0,
  totalCustomersServed: 0,
  totalDaysPlayed: 0,
});

export const recordDayResult = (
  lb: Leaderboard,
  result: DayResult
): Leaderboard => {
  const newTotalEarnings = lb.bestTotalEarnings + result.earnings;
  return {
    bestDayServed: Math.max(lb.bestDayServed, result.served),
    bestDayEarnings: Math.max(lb.bestDayEarnings, result.earnings),
    bestTotalEarnings: newTotalEarnings,
    totalCustomersServed: lb.totalCustomersServed + result.served,
    totalDaysPlayed: lb.totalDaysPlayed + 1,
  };
};

export const serializeLeaderboard = (lb: Leaderboard): string =>
  JSON.stringify(lb);

export const deserializeLeaderboard = (
  raw: string
): Leaderboard | undefined => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    if (typeof parsed.bestDayServed !== "number") return undefined;
    if (typeof parsed.bestDayEarnings !== "number") return undefined;
    if (typeof parsed.bestTotalEarnings !== "number") return undefined;
    if (typeof parsed.totalCustomersServed !== "number") return undefined;
    if (typeof parsed.totalDaysPlayed !== "number") return undefined;
    return {
      bestDayServed: parsed.bestDayServed,
      bestDayEarnings: parsed.bestDayEarnings,
      bestTotalEarnings: parsed.bestTotalEarnings,
      totalCustomersServed: parsed.totalCustomersServed,
      totalDaysPlayed: parsed.totalDaysPlayed,
    };
  } catch {
    return undefined;
  }
};
