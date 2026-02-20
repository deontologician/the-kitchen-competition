# The Kitchen Competition

## Game Overview

A restaurant management game built with Phaser 3 + TypeScript + Vite. Players compete by running different restaurant types through a core day loop: shop for ingredients (30s grocery phase), prep in the kitchen (30s), then serve customers at the restaurant (120s service phase with order → cook → serve sub-cycle). Each day ends with an earnings summary (5 coins per customer served), then the next day starts.

## Architecture: Domain / Rendering Split

- **`src/domain/`** — Pure TypeScript game logic. **Zero Phaser imports.** This is what we TDD.
- **`src/scenes/`** — Thin Phaser rendering layer that consumes domain logic via interfaces.

This separation is non-negotiable. Domain code must be testable without any game framework.

## Development Methodology: Strict TDD + Post-Feature Refactoring

1. **Tests first, always.** Write a failing test before writing any domain code.
2. Red → Green → Refactor. No exceptions.
3. Every domain function must have corresponding tests.
4. **Commit on green.** After each meaningful green step (tests pass + TS compiles), make a git commit with a descriptive message explaining the *why* of the change.
5. **After every plan implementation, update this CLAUDE.md** to reflect new/changed modules, scenes, registry keys, and architecture decisions so the documentation stays current.
6. **Commit at the end of every plan implementation.** Once CLAUDE.md is updated and all tests pass, make a final git commit covering any remaining changes. Every plan should end with a clean working tree (relative to plan-related files).

### Post-Feature Refactoring Phase

After each feature is implemented and proven working (playtested, fun, tests green), run a dedicated refactoring pass:

1. **Discover algebras.** Look for common patterns across the domain — shared shapes, repeated transformations, composable operations. Extract these into clean algebraic structures (e.g., a common `Result<T>` pattern, a `StateTransition<S>` type, composable inventory operations).
2. **Compactify.** Reduce code volume by finding the elegant core. If three modules do similar things, unify them. If a 50-line function can be a 10-line pipeline, refactor it. The goal is minimal, expressive domain code.
3. **Strengthen types.** After seeing how the code actually behaves, tighten types — make illegal states unrepresentable, turn stringly-typed IDs into branded types where it helps, use const enums or literal unions instead of loose strings.
4. **Preserve behavior.** All existing tests must still pass. The refactoring phase changes structure, not behavior. Add new tests only if the refactoring reveals untested invariants.
5. **Commit the refactoring separately.** Refactoring commits should be clearly labeled as such so they're distinct from feature work in the git history.

## Coding Conventions

### Module Design
- Export only **interfaces + factory functions**. Keep concrete types internal.
- Prefer small, focused modules. One concept per file.

### Functional Style
- **No `for` loops.** Use `map`, `filter`, `reduce`, `flatMap`, etc.
- **Minimize mutation.** Use `readonly` on all interface properties by default.
- **Discriminated unions** for state modeling. Use exhaustive checks (`never` in default branches).
- Pure functions wherever possible. Side effects at the edges only.

### TypeScript
- `readonly` by default on all properties.
- Prefer `interface` over `type` for object shapes.
- Use `as const` for literal types.
- No `any`. Use `unknown` if the type is truly unknown.

### Testing
- **Vitest** as the test runner.
- **fast-check** for property-based tests on domain invariants.
- Mix example-based and property-based tests.
- Test files live in `src/domain/__tests__/` and match `*.test.ts`.
- Coverage is scoped to `src/domain/` only.

## Commands

```bash
npm run dev        # Start Vite dev server (opens browser)
npm run build      # Production build
npm test           # Run tests once
npm run test:watch # Run tests in watch mode
npm run coverage   # Run tests with coverage report
npm run deploy     # Build and deploy to GitHub Pages (gh-pages branch)
```

## Project Structure

```
src/
  domain/          # Pure game logic (TDD'd, no Phaser)
    __tests__/     # Test files
  scenes/          # Phaser scenes (thin rendering layer)
  main.ts          # Phaser game entry point
tools/
  gemini-image.mjs # CLI tool for generating game assets via Gemini API
public/
  assets/          # Generated game assets (images, animation frames)
    items/         # 74 item icon sprites (64x64, transparent PNG)
```

## Codebase Details

### Domain Modules (`src/domain/`)
- **`branded.ts`** — Branded string types for compile-time ID safety. Types: `CustomerId`, `OrderId`, `SlotId`, `ItemId` (all `string & { __brand }` intersections). Factory functions: `customerId`, `orderId`, `slotId`, `itemId`. Zero-cost at runtime — types erase to plain strings.
- **`pixel-font.ts`** — 5x7 bitmap pixel font. Supports A-Z, 0-9, space, and `$` (coin icon). Exports: `getGlyph`, `layoutLines`, `measureLineWidth`, `computeCenterOffset`, `createDefaultLayoutConfig`.
- **`wallet.ts`** — Coin currency. `Wallet` interface with pure functions: `createWallet`, `initialWallet` (20 coins), `addCoins`, `spendCoins` (returns `undefined` if can't afford), `canAfford`, `formatCoins` (returns `"$N"` where `$` renders as coin icon).
- **`save-game.ts`** — Legacy v1 localStorage persistence. Pure serialization/validation with `SaveData` interface (version 1 + coins). Exports: `SAVE_KEY`, `createSaveData`, `serializeSave`, `deserializeSave` (returns `undefined` on invalid input), `saveDataToWallet`. Still used by `save-slots.ts` for v1→v2 migration.
- **`save-slots.ts`** — Multi-slot save system (v2). Types: `RestaurantType` (`"sushi" | "bbq" | "burger"`), `SaveSlot` (id, restaurantType, day, coins, scene, lastSaved), `SaveStore` (version 2 + slots array). Pure functions: `createSaveSlot`, `createSaveStore`, `addSlot`, `updateSlot`, `removeSlot`, `findSlot`, `findMostRecent`, `serializeStore`, `deserializeStore`, `loadStore` (v2 parse → v1 migration → empty), `sceneDisplayName`, `restaurantDisplayName`, `formatSlotSummary`. All timestamps/IDs are parameters (no side effects).
- **`money.ts`** — Cents-based money type (legacy/unused). `Money` interface with `createMoney`, `fromDollars`, `addMoney`, `subtractMoney`.
- **`tables.ts`** — Restaurant table tracking. `Table` (id + optional customerId), `TableLayout` (readonly array of tables). Pure functions: `createTableLayout(count)`, `emptyTableIds`, `seatCustomer`, `unseatCustomer`, `findCustomerTable`, `occupiedCount`, `tableCount`. Randomness stays outside domain — scene picks random id from `emptyTableIds()`.
- **`panel.ts`** — UI panel constraint resolution. `PanelSpec` (margins + optional explicit width/height), `ResolvedPanel` (x/y/width/height), `PanelAppearance` (fillColor/Alpha, borderRadius/Color/Width). Pure function: `resolvePanel(spec, canvasWidth, canvasHeight)`. Also exports `defaultPanelAppearance` (black, 0.55 alpha, 8px radius).
- **`items.ts`** — Item definitions for the crafting system. Types: `ItemCategory` (`"raw" | "prepped" | "dish"`), `ItemDef` (id, name, category, cost, shelfLifeMs). 74 items total: 28 raw ingredients (cost $1-3, no shelf life), 31 prepped/cooked intermediates (shelf life 30-120s), 15 finished dishes (shelf life 30-60s). O(1) lookup via internal Map. Exports: `findItem`, `rawItems`, `preppedItems`, `dishItems`, `allItems`.
- **`recipes.ts`** — Recipe step definitions and dependency chain resolution. Types: `RecipeMethod` (`"prep" | "cook" | "assemble"`), `RecipeInput` (itemId + quantity), `RecipeStep` (id, name, inputs, output, method, timeMs), `RecipeNode` (step + children tree). 46 recipe steps: prep/cook for intermediates, assemble for dishes (timeMs 0), miso soup is the only cook-method dish (5s). Exports: `findRecipe`, `recipesForOutput`, `allRecipes`, `resolveRecipeChain` (builds full dependency tree), `flattenRecipeChain` (topological order, leaves first), `totalRawIngredients` (aggregates raw costs), `totalRecipeTime`.
- **`inventory.ts`** — Immutable inventory with FIFO removal. Types: `InventoryItem` (itemId + createdAt timestamp), `Inventory` (readonly items array), `ItemFreshness` (itemId + freshness fraction). Exports: `createInventory`, `addItem`, `addItems`, `removeItems` (FIFO oldest-first, returns `undefined` if insufficient), `removeItemSet` (atomic all-or-nothing), `removeExpired` (drops items past shelf life using `findItem`), `countItem`, `itemCounts`, `itemFreshness` (returns per-item freshness fraction 0..1 using min across duplicates), `hasIngredientsFor`, `executeRecipeStep` (atomic: consume inputs → produce output, returns `undefined` on failure).
- **`menu.ts`** — Per-restaurant-type menu definitions. Types: `MenuItem` (dishId + sellPrice), `MenuDef` (restaurantType + items). 5 dishes per type with sell prices ($5-12). Exports: `menuFor`, `dishIdsFor`, `groceryItemsFor` (resolves full dependency chains to find all raw ingredient ids), `availableRecipesFor` (all prep/cook/assemble steps reachable from a type's dishes), `pickRandomDish` (uniform random selection from menu).
- **`day-cycle.ts`** — Core day loop state machine. Types: `Customer` (id, dishId, patienceMs, maxPatienceMs), `Order`, `ServiceSubPhase` (discriminated: `waiting_for_customer` | `taking_order` | `cooking` | `serving`), `Phase` (discriminated: `grocery` | `kitchen_prep` | `service` | `day_end`), `ServicePhase`, `TimedPhase`, `DayCycle` (day + phase), `PhaseDurations`. The `service` phase variant includes `tableLayout`, `customerQueue`, `customersServed`, `customersLost`, `earnings`. Pure functions: `createDayCycle`, `createCustomer` (factory, default 60s patience), `tickTimer`, `isPhaseTimerExpired`, `isTimedPhase`, `timerFraction`, `advanceToKitchenPrep`, `advanceToService` (optional 3rd param `tableCount`, default 4), `advanceToDayEnd`, `advanceToNextDay`, `enqueueCustomer`, `beginTakingOrder`, `beginCooking`, `finishCooking`, `finishServing` (takes dishEarnings), `abandonOrder`, `activeCustomerId`, `tickCustomerPatience`, `removeExpiredCustomers` (increments customersLost), `activeSceneForPhase`. Default durations: grocery 30s, kitchen prep 30s, service 120s.
- **`difficulty.ts`** — Day-based difficulty scaling. `DayDifficulty` interface with spawn intervals, patience ranges, max customers per day. `difficultyForDay(day)` computes parameters: spawn interval decreases from 10-15s to 3-5s floor, patience from 45-75s to 15-30s floor, max customers from 8 to 30 cap. All values monotonically scale with day number.
- **`leaderboard.ts`** — Cross-game high score tracking. `Leaderboard` interface (bestDayServed, bestDayEarnings, bestTotalEarnings, totalCustomersServed, totalDaysPlayed), `DayResult` (served + earnings). Exports: `createLeaderboard`, `recordDayResult`, `serializeLeaderboard`, `deserializeLeaderboard` (returns `undefined` on invalid). Persisted to localStorage key `"the-kitchen-competition-lb"`.
- **`balance-sim.ts`** — Pure economy simulation for balance validation. Seeded PRNG (mulberry32), dish economics analysis, and discrete day simulation (no real-time). Types: `DishEconomics` (dishId, sellPrice, rawCost, profit, rawIngredients, prepTimeMs), `DayReport` (per-day wallet/spend/revenue tracking), `SimulationResult` (multi-day trajectory with bankruptcy detection), `BuyingStrategy` (pluggable grocery strategy). Three built-in strategies: `naiveStrategy` (round-robin), `cheapestFirstStrategy` (minimize ingredient cost), `profitFirstStrategy` (maximize margin). Exports: `createRng`, `analyzeDish`, `analyzeMenu`, `simulateDay`, `runSimulation`, plus strategy functions. Simulation flow per day: buy ingredients → prep within 30s budget → serve customers (pre-prepped instant, unprepped cook-to-order at 2s each from 120s service budget) → track wallet. Verified: all 3 restaurant types survive 15+ days with all strategies from $20 starting coins.

### Scenes (`src/scenes/`)
- **`TitleScene`** — Entry point. Loads title background/text images. Initializes `saveStore` and `leaderboard` in registry from localStorage. Shows menu: **New Game** (always), **Continue** + **Load Game** (if saves exist). Shows leaderboard stats at bottom (best day served/earnings, totals) if any games played. New Game flow shows restaurant type selection (Burger Joint/BBQ/Sushi with difficulty). Initializes `dayCycle` in registry for new game (day 1) and continue (from saved day). Auto-save listeners: `changedata-wallet` updates active slot coins, `changedata-saveStore` persists to localStorage, `changedata-dayCycle` updates active slot's day, `changedata-leaderboard` persists to localStorage.
- **`LoadGameScene`** — Lists save slots sorted by most recent, using `formatSlotSummary` labels. Clicking a slot sets `dayCycle` from slot's day and starts at GroceryScene. Back button returns to TitleScene.
- **`GroceryScene`** — Grocery store. Loads themed background via `backgroundKey(type, "grocery")`. Calls `recordSceneEntry` on create. Renders panel overlay + pixel-art title + coin HUD (top-right). Timer bar at top shows "SHOPPING" countdown (30s). `update()` ticks timer via `tickTimer`, redraws bar. When expired, auto-transitions to KitchenScene via `advanceToKitchenPrep`. Esc key pauses and launches PauseScene.
- **`KitchenScene`** — Dual-mode kitchen. Loads themed background via `backgroundKey(type, "kitchen")`. Renders panel overlay. **Prep mode** (`kitchen_prep` phase): timer bar with "PREPPING" countdown (30s), auto-transitions to RestaurantScene via `advanceToService`. **Cooking mode** (`service` phase, `cooking` sub-phase): shows "COOKING ORDER..." text, 2s delayed call to `finishCooking`, returns to RestaurantScene. Service timer keeps ticking during cooking; if it expires, transitions to day end. Esc key pauses and launches PauseScene.
- **`RestaurantScene`** — Service phase hub. Loads themed background + table sprites (2x3 grid at `TABLE_POSITIONS`). Timer bar shows "DAY X - SERVICE M:SS". Uses `difficultyForDay(cycle.day)` for spawn timing, patience ranges, and max customers per day. Delegates to extracted helpers: `renderTableOverlays` (table tints/bubbles/patience bars), `renderInventorySidebar` (inventory display), `animateServe`/`animateCustomerLeft`/`animateArrival` (service animations), `showNotification` (fade-out notifications). Auto-calls `beginTakingOrder` when waiting + queue non-empty. "Serve Now" button if dish in inventory (skips kitchen trip via `doServe`), else "Cook Order" → KitchenScene. Day-end overlay: customers served, customers lost (red, if > 0), earnings, total wallet, "Next Day" button. Esc pauses.
- **`PauseScene`** — Esc-key overlay launched from gameplay scenes via `scene.launch()` + `scene.pause()`. Dark overlay (0.75 alpha). **Main menu:** Resume, Save, Load Game, Debug, Quit to Title. **Save:** touches active slot's `lastSaved` to trigger auto-save listeners, shows "Saved!" feedback. **Load Game sub-menu:** lists save slots sorted by recency via `formatSlotSummary`, clicking loads slot and starts GroceryScene. **Debug sub-menu:** Skip Phase (advances day-cycle to next phase via appropriate advance function), Add 50 Coins. **Quit to Title:** stops caller + pause scenes, starts TitleScene. Esc key resumes gameplay. Pausing freezes `update()` and all Phaser timers automatically.
- **`renderPixelText.ts`** — Rendering helper. `renderPixelText(scene, lines, options)` draws pixel font text with dark backdrop. Supports centered (`centerY`) or absolute (`x`/`y`) positioning. `addNavButton(scene, x, y, label, targetScene)` creates clickable scene-transition buttons. `addMenuButton(scene, x, y, label, onClick)` creates clickable buttons with callback.
- **`timerBar.ts`** — Timer bar rendering helper. `renderTimerBar(scene, x, y, width, height, fraction, options?)` draws a color-coded progress bar (green >50%, yellow 25-50%, red <25%) with optional label. `formatTimeRemaining(ms)` formats milliseconds as `M:SS`. (Debug skip buttons removed — debug tools now live in PauseScene.)
- **`panel.ts`** — Panel rendering helper. `renderPanel(scene, spec, appearance?)` calls `resolvePanel` from domain, draws a Phaser rounded rectangle with fill + optional stroke. Merges caller appearance with `defaultPanelAppearance`.
- **`restaurantTypeHelper.ts`** — Per-restaurant-type asset helpers. `getActiveRestaurantType(registry)` reads `activeSlotId` + `saveStore` from registry, returns type (defaults to "burger"). `backgroundKey(type, scene)` → e.g. `"burger-grocery-bg"`. `backgroundAssetPath(type, scene)` → e.g. `"assets/burger-grocery-bg.png"`. `tableKey(type)` → e.g. `"burger-table"`. `tableAssetPath(type)` → e.g. `"assets/burger-table.png"`.
- **`saveHelpers.ts`** — `recordSceneEntry(registry, sceneKey)` updates the active slot's scene + lastSaved timestamp in the save store. `recordDayAdvance(registry, day)` updates the active slot's day field in the save store.
- **`tutorialHint.ts`** — `showTutorialHint(scene, phaseTag)` shows a contextual TIP banner at the bottom of the scene on Day 1 only. Phase-specific hints for grocery, kitchen_prep, and service. Auto-fades after 10 seconds using depth layering to stay visible above dynamic content.
- **`notification.ts`** — `showNotification(scene, state, message, color)` renders fade-out notification text at bottom of scene. `NotificationState` tracks active objects for cleanup. Used for "Customer left!" and "Item expired!" alerts.
- **`inventorySidebar.ts`** — `renderInventorySidebar(scene, inventory, oldObjects)` renders right-aligned inventory list with freshness color-coding (white → yellow → red). Dishes shown first, then prepped items with divider.
- **`tableRenderer.ts`** — `renderTableOverlays(scene, phase, layout, oldBubbles)` renders table tints (white/green/yellow/red/blue), order bubbles (32px dish sprites), and patience bars. `TablePositions` interface for sprite/position pairs.
- **`serviceAnimations.ts`** — `animateServe(scene, sprite, pos)` creates "+$" float + table pop tween. `animateCustomerLeft(scene, tableIds, sprites)` does red flash. `animateArrival(scene, sprite)` does bounce on customer spawn.

### Game Config (`src/main.ts`)
- 800x600 canvas, `pixelArt: true`, background `#1d1d2e`
- Scene order: Title → Grocery → Kitchen → Restaurant → LoadGame → Pause

### State Management
- **Phaser Registry** (`this.registry`) for cross-scene state.
- Registry keys:
  - `"saveStore"` (`SaveStore`) — All save slots. Set by TitleScene init, wallet listener, `recordSceneEntry`, `recordDayAdvance`.
  - `"activeSlotId"` (`string`) — ID of the currently active save slot. Set by menu selection.
  - `"wallet"` (`Wallet`) — Current coin state. Set by menu selection and gameplay (day-end earnings).
  - `"leaderboard"` (`Leaderboard`) — Cross-game high scores. Set by TitleScene init, updated by RestaurantScene at day end.
  - `"dayCycle"` (`DayCycle`) — Current day/phase state machine. Set by TitleScene (new game/continue), LoadGameScene (load), and scene `update()` loops.
- TitleScene initializes `saveStore` on first visit; subsequent visits preserve existing value.
- Scenes read wallet with fallback: `this.registry.get("wallet") ?? initialWallet`.

### Persistence (localStorage)
- **Save key:** `"the-kitchen-competition"` (exported as `SAVE_KEY` from `save-game.ts`).
- **Save format:** v2 `SaveStore` with multiple `SaveSlot` entries (id, restaurantType, day, coins, scene, lastSaved).
- **Auto-save:** Three registry listeners in TitleScene:
  1. `changedata-wallet` → updates active slot's coins + lastSaved in store → triggers `registry.set("saveStore", ...)`
  2. `changedata-saveStore` → `localStorage.setItem(SAVE_KEY, serializeStore(store))`
  3. `changedata-dayCycle` → updates active slot's day via `recordDayAdvance`
- **Scene tracking:** Gameplay scenes call `recordSceneEntry` on create, updating the active slot's scene + lastSaved.
- **Load on startup:** TitleScene reads localStorage via `loadStore()`, which tries v2 parse → v1 migration → empty store.
- **Backward compatibility:** v1 saves (`{"version":1,"coins":N}`) are auto-migrated to a v2 store with one slot (burger, day 1, GroceryScene).
- **Domain/rendering split preserved:** All serialization/validation is pure domain code in `save-slots.ts` and `save-game.ts`. Only `TitleScene` touches `localStorage`.

### Themed Assets (`public/assets/`)
- **Naming convention:** `{type}-{scene}-bg.png` for backgrounds, `{type}-table.png` for table sprites
- **Backgrounds (9):** `burger-grocery-bg.png`, `bbq-grocery-bg.png`, `sushi-grocery-bg.png`, `burger-kitchen-bg.png`, `bbq-kitchen-bg.png`, `sushi-kitchen-bg.png`, `burger-restaurant-bg.png`, `bbq-restaurant-bg.png`, `sushi-restaurant-bg.png`
- **Table sprites (3):** `burger-table.png`, `bbq-table.png`, `sushi-table.png` (transparent RGBA PNGs)
- **Legacy generic backgrounds:** `grocery-bg.png`, `kitchen-bg.png`, `restaurant-bg.png` (kept as fallbacks, no longer loaded by scenes)

## Deployment

- **Hosted at:** `https://deontologician.github.io/the-kitchen-competition/`
- **Method:** `npm run deploy` builds with Vite and pushes `dist/` to the `gh-pages` branch via the `gh-pages` npm package. No GitHub Actions needed.
- **Vite base path:** `base: "/the-kitchen-competition/"` in `vite.config.ts` ensures asset URLs resolve correctly on GitHub Pages.
- **GitHub Pages source:** `gh-pages` branch, root (`/`).

## Asset Generation (Gemini Image Tool)

Uses Google Gemini API via OAuth tokens shared with the `wallpaper-gen` app.

```bash
# Generate a new image
npm run img:generate -- --prompt "pixel art chef, 64x64, transparent bg" --output public/assets/chef.png

# Edit an existing image
npm run img:edit -- --prompt "add a chef hat" --input public/assets/chef.png --output public/assets/chef-hat.png

# Generate animation frames
npm run img:animate -- --prompt "chef stirring, frame 1 of 4" \
  --edit-prompt "next frame of stirring animation" \
  --output-dir public/assets/chef-stir --frames 4
```

**Flags:** `--aspect` (aspect ratio, omit for model default), `--model` (default `gemini-2.5-flash-image`; alt: `gemini-3-pro-image-preview`, `gemini-2.0-flash-exp-image-generation`), `--prefix` (animation frame prefix, default `frame`), `--raw` (skip the built-in game style prefix), `--transparent` (remove background via ImageMagick flood-fill, outputs RGBA PNG)

**Style:** All prompts are automatically prefixed with a 16-bit pixel art style directive for visual consistency. Use `--raw` to bypass this for non-game assets.

**Transparency:** Use `--transparent` for game sprites. Requires `imagemagick` (in `shell.nix`). The model generates a solid-color background, then ImageMagick flood-fills from corners to produce real alpha. Default model is `gemini-2.5-flash-image` (returns PNG; `gemini-3-pro-image-preview` returns JPEG, which is lossy).
