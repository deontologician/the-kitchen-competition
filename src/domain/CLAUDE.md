# Domain Layer (`src/domain/`)

**Hard rule: Zero Phaser imports.** Everything here is pure TypeScript, testable without any game framework.

## Module Map

- **`branded.ts`** — Branded string types (`CustomerId`, `OrderId`, `SlotId`, `ItemId`) for compile-time ID safety. Factory functions erase to plain strings at runtime.
- **`pixel-font.ts`** — 5x7 bitmap pixel font (A-Z, 0-9, space, `$` coin icon). Exports `getGlyph`, `layoutLines`, `measureLineWidth`, `computeCenterOffset`.
- **`wallet.ts`** — Coin currency with `Wallet` interface. `initialWallet` = 20 coins. `spendCoins` returns `undefined` if can't afford. `formatCoins` renders `"$N"` with coin icon.
- **`save-game.ts`** — Legacy v1 localStorage persistence (`SaveData` version 1 + coins). Still used by `save-slots.ts` for v1→v2 migration.
- **`restaurant-type.ts`** — `RestaurantType` (`"sushi" | "bbq" | "burger"`) + `restaurantDisplayName`. Canonical import source — 9+ modules depend on this.
- **`save-slots.ts`** — Multi-slot save system (v2). `SaveSlot` (id, restaurantType, day, coins, scene, lastSaved, unlockedDishes), `SaveStore` (version 2 + slots). Re-exports `RestaurantType` for backward compat. `loadStore` handles v2 parse → v1 migration → empty.
- **`tables.ts`** — Table tracking with `TableLayout`. `createTableLayout(count)`, `seatCustomer`, `unseatCustomer`, `emptyTableIds`. Randomness stays outside domain.
- **`layout.ts`** — Pure layout constraint primitives. Types: `Rect`, `Point`, `Anchor`, `Inset`, `GridSpec`, `GridCell`, `StackSpec`, `StackItem`. Functions: `canvasRect`, `insetRect`, `anchorPoint`, `anchoredRect`, `gridCells`, `stackItems`. All UI positions derive from parent rects via these composable functions.
- **`panel.ts`** — UI panel constraint resolution. `resolvePanel(spec, canvasW, canvasH)` → `ResolvedPanel`. Also exports `defaultPanelAppearance`.
- **`items.ts`** — 74 item definitions: 28 raw ($1-3, no shelf life), 31 prepped (30-120s shelf life), 15 dishes (30-60s). O(1) lookup via `findItem`. Category type: `"raw" | "prepped" | "dish"`.
- **`recipes.ts`** — 46 recipe steps with dependency chains. Methods: `"prep" | "cook" | "assemble"`. Core abstraction: `foldRecipeTree` catamorphism with dedup. Derived: `flattenRecipeChain`, `totalRawIngredients`, `totalRecipeTime`.
- **`inventory.ts`** — Immutable inventory with FIFO removal. `removeItems` oldest-first, `removeItemSet` atomic all-or-nothing, `removeExpired` drops stale items. `executeRecipeStep` atomically consumes inputs and produces output.
- **`menu.ts`** — Per-restaurant menus with progressive dish unlocking. 5 dishes per type ($5-12). `STARTER_DISH_COUNT = 1`. `unlocked*` variants are the core implementations; full-menu functions delegate with `count=Infinity`. `shouldUnlockNextDish` checks loss/coins/capacity.
- **`day-cycle.ts`** — Day loop state machine. Phases: `grocery` → `kitchen_prep` → `service` → `day_end`. Service has sub-phases: `waiting_for_customer` → `taking_order` → `cooking` → `serving`. Service phase tracks `tableLayout`, `customerQueue`, `customersServed/Lost`, `earnings`. Default durations: 30s/30s/120s. `isRestaurantIdle(phase)` → true when `waiting_for_customer` with empty queue (used for early day-end).
- **`difficulty.ts`** — Day-based difficulty scaling via `difficultyForDay(day)`. Spawn intervals (10-15s → 3-5s floor), patience (45-75s → 15-30s floor), max customers (8 → 30 cap). All monotonically scale.
- **`leaderboard.ts`** — Cross-game high scores: best day served/earnings, totals. `recordDayResult` updates. Persisted to localStorage key `"the-kitchen-competition-lb"`.
- **`balance-sim.ts`** — Pure economy simulation with seeded PRNG (mulberry32). Three buying strategies (naive, cheapest-first, profit-first). Verified: all restaurant types survive 15+ days from $20 starting coins.

## View Model Layer (`view/`)

Pure functions bridging domain state → scene-renderable data. Zero Phaser imports.

- **`format.ts`** — `formatTimeRemaining(ms)` → `"M:SS"`, `truncateName`, three-bucket classifiers via `classify3`: `timerColor` (green/yellow/red), `freshnessLevel` (fresh/warning/critical), `patienceLevel` (ok/warning/critical). Thresholds: >50% / >25% / ≤25%.
- **`timer-vm.ts`** — `timerBarVM(phase, day)` → `TimerBarVM` (fraction, label, color). Label: `"DAY {day} - {PHASE} {M:SS}"`. Returns `undefined` for `day_end`.
- **`inventory-vm.ts`** — `inventoryVM(inventory, now)` → grouped dishes + prepped items with freshness levels. Names truncated to 12 chars.
- **`grocery-vm.ts`** — `groceryVM(wallet, inventory, restaurantType, unlockedCount)` → item list with affordability, counts, sprite keys. Names truncated to 10 chars.
- **`kitchen-vm.ts`** — `kitchenVM(inventory, restaurantType, unlockedCount, activeRecipe, now)` → recipe list with craftability, input have/need, active cooking progress.
- **`day-end-vm.ts`** — `dayEndVM(phase, day, wallet, restaurantType, currentUnlocked)` → earnings summary + dish unlock decision (`DishUnlockVM`).
- **`restaurant-vm.ts`** — `restaurantVM(phase, inventory, restaurantType, unlockedCount)` → table statuses with tints/patience + action prompts (waiting/taking_order/cooking/serving).
- **`scene-layout.ts`** — Centralized layout presets derived from `layout.ts` primitives. Exports named positions/regions for all scenes: `canvas`, `gameplayPanel`, `timerBar`, `skipButtonPos`, `coinHudPos`, `groceryGrid()`, `recipeRegion`, `recipeStack()`, `kitchenInvRegion`, `tablePositions()`, `sidebarAnchor`, `hintRegion`, `notificationPos`, `menuStack()`. All magic numbers live here; scenes import instead of hardcoding.

## Testing

- **Vitest** + **fast-check** for property-based tests on domain invariants.
- Test files: `src/domain/__tests__/*.test.ts`, view model tests in `__tests__/view/`.
- `algebraic-properties.test.ts` — Cross-module property tests: wallet monoid, inventory consistency, removeExpired idempotence, timer/difficulty monotonicity, menu prefix, leaderboard max, classify3 boundaries, spend/afford consistency.
- Coverage scoped to `src/domain/` only.
