export interface DayDifficulty {
  readonly customerSpawnMinMs: number;
  readonly customerSpawnMaxMs: number;
  readonly customerPatienceMinMs: number;
  readonly customerPatienceMaxMs: number;
  readonly maxCustomersPerDay: number;
}

// Clamp a value between min and max
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * Compute difficulty parameters for a given day number.
 *
 * Day 1 is the easiest. Each subsequent day:
 * - Customers spawn faster (interval decreases)
 * - Customers have less patience
 * - More customers arrive per day
 *
 * All values have floors to keep the game playable.
 */
export const difficultyForDay = (day: number): DayDifficulty => {
  const level = day - 1; // 0-indexed difficulty level

  // Spawn interval: starts at 10-15s, decreases by ~700ms per day, floor 3-5s
  const spawnMin = clamp(10_000 - level * 700, 3_000, 10_000);
  const spawnMax = clamp(15_000 - level * 700, 5_000, 15_000);

  // Patience: starts at 45-75s, decreases by ~3s per day, floor 15-30s
  const patienceMin = clamp(45_000 - level * 3_000, 15_000, 45_000);
  const patienceMax = clamp(75_000 - level * 3_000, 30_000, 75_000);

  // Max customers: starts at 8, increases by 2 per day, cap 30
  const maxCustomers = clamp(8 + level * 2, 8, 30);

  return {
    customerSpawnMinMs: spawnMin,
    customerSpawnMaxMs: spawnMax,
    customerPatienceMinMs: patienceMin,
    customerPatienceMaxMs: patienceMax,
    maxCustomersPerDay: maxCustomers,
  };
};
