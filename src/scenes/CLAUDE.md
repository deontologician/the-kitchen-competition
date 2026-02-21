# Scenes Layer (`src/scenes/`)

**Hard rule: Thin rendering only.** Consume domain logic via view models. No business logic here.

## Scenes

- **`TitleScene`** — Entry point. Inits `saveStore` + `leaderboard` from localStorage. Menu: New Game (always), Continue + Load Game (if saves exist). New Game shows restaurant type picker (Burger/BBQ/Sushi). Leaderboard stats at bottom. Auto-save via `persistSnapshot()` registered on both `setdata-*` and `changedata-*` for wallet, dayCycle, and inventory. "Continue" restores full phase/inventory and routes to the correct scene via `activeSceneForPhase`.
- **`LoadGameScene`** — Lists save slots sorted by recency via `formatSlotSummary`. Click loads slot → correct scene (not hardcoded GroceryScene). Restores full phase, inventory, and wallet from slot. Back → TitleScene.
- **`GroceryScene`** — 30s shopping phase. Uses `groceryVM` for item grid + `timerBarVM` for countdown. Panel overlay + pixel-art title + coin HUD. **"MENU ▼" button** opens `showMenuPanel()` overlay listing all unlocked dishes with ON/OFF toggles — clicking a dish calls `toggleDish`, saves via registry, and re-renders the grocery grid. Auto-transitions to KitchenScene on timer expiry. Calls `recordSceneEntry` on create. Esc → PauseScene.
- **`KitchenScene`** — Dual-mode zone-based kitchen. Both modes share three zone panels (cutting board 1-slot, stove 3-slot, oven 2-slot) and a pantry strip. **Prep mode** (`kitchen_prep` phase): 30s countdown; center shows zone panels; right strip (pantry) lists recipe steps with zone badge — tap to consume inputs and place output in zone; cutting board requires hold (pointerdown/up/out → `activateCuttingBoardSlot`); stove flip shows button on `needs_flip` slots (`flipStoveSlot`); oven is passive; completed items added to inventory via `addItem`; ready pile cleared each frame; "Done Prepping" → `advanceToService`. Scene-local `KitchenZoneState` (`prepZones`) ticked in `update()`. **Service mode** (`service` phase, `playerLocation === "kitchen"`): left strip shows pending orders with per-component status (`needed/in_zone/ready`) + "ASSEMBLE" button when `isAssemblable` — tapping calls `assembleOrder()` then `notifyOrderReady()` to update table state; center shows zone panels using domain `kitchen.zones`; right strip pantry calls `placeIngredientInZone`; bottom shows ready pile items; "Go to Floor" → `movePlayer(phase, "floor")` + `scene.start("RestaurantScene")`. State key diffing (bucketed to 20 progress steps) avoids per-frame re-renders. Uses `kitchenServiceVM(kitchen, inventory)` for service mode VMs. Esc → PauseScene.
- **`RestaurantScene`** — Service phase FOH hub. 2x3 table grid via `tablePositions()`. Uses `restaurantVM` for per-table `TableVM` actions. Each table shows action button derived from `TableVM.action`: `take_order` → "Take Order", `send_to_kitchen` → "To Kitchen" (or "Serve Now" if dish in inventory), `serve` → "Serve". **"Go to Kitchen" button** (always visible during service) → `movePlayer(phase, "kitchen")` + `scene.start("KitchenScene")`; shows badge when `phase.kitchen.orderUp.length > 0`. `update()` calls `tickServicePhase(phase, delta)`. Per-table action buttons tracked with state keys and only re-rendered on state change. `spawnCustomer` uses `enqueueCustomer` (auto-seats). Day-end overlay with "Next Day" button. Coin HUD shows wallet + service earnings. Ends day early when `isRestaurantIdle` + inventory empty. Skips initial 2s customer spawn when loading into a service phase with existing customers. Esc → PauseScene.
- **`PauseScene`** — Esc-key overlay via `scene.launch()` + `scene.pause()`. Menus: Resume, Save, Load Game, Debug (Skip Phase, Add 50 Coins), Quit to Title. Save uses `snapshotSlotPatch` for full-state persistence. Load restores full phase/inventory and routes to correct scene. Pausing freezes `update()` and all Phaser timers.

## Scene Helpers

- **`renderPixelText.ts`** — `renderPixelText(scene, lines, options)` draws pixel font with backdrop; returns `Phaser.GameObjects.Graphics` so callers can destroy and redraw. `addNavButton` / `addMenuButton` for clickable buttons.
- **`timerBar.ts`** — `renderTimerBar(scene, ...)` → `TimerBarResult` (graphics + label). `TIMER_COLOR_HEX` maps colors. Re-exports `formatTimeRemaining`.
- **`panel.ts`** — `renderPanel(scene, spec, appearance?)` draws Phaser rounded rect via domain `resolvePanel`.
- **`restaurantTypeHelper.ts`** — `getActiveRestaurantType(registry)`, `getActiveUnlockedCount(registry)`, `getActiveDisabledDishes(registry)` (returns `slot.disabledDishes ?? []`). Asset key helpers: `backgroundKey(type, scene)` → `"burger-grocery-bg"`, `tableKey(type)` → `"burger-table"`, plus `*AssetPath` variants.
- **`saveHelpers.ts`** — `recordSceneEntry(registry, sceneKey)` updates active slot's scene + lastSaved via `patchSlot`. `recordDayAdvance(registry, day)` updates day via `patchSlot`. Both preserve all other slot fields including `disabledDishes`.
- **`notification.ts`** — `showNotification(scene, state, message, color)` renders fade-out alerts ("Customer left!", "Item expired!").
- **`inventorySidebar.ts`** — `renderInventorySidebar(scene, inventory, oldObjects)` renders right-aligned list with freshness color-coding.
- **`tableRenderer.ts`** — `renderTableOverlays(scene, phase, layout, oldBubbles)` renders table tints, order bubbles (32px dish sprites), patience bars. Iterates `phase.tables: TableState[]` directly; each tag (empty/customer_waiting/order_pending/in_kitchen/ready_to_serve) has distinct rendering (tint, sprite alpha, "..." indicator, bar position).
- **`serviceAnimations.ts`** — `animateServe` (+$ float + pop), `animateCustomerLeft` (red flash), `animateArrival` (bounce).

## Layout Pattern

All UI positions are derived from `src/domain/view/scene-layout.ts`, which exports named constants and functions built on the `layout.ts` primitives. Scenes import positions instead of using hardcoded pixel values:

```ts
import { skipButtonPos, groceryGrid, timerBar } from "../domain/view/scene-layout";
addMenuButton(this, skipButtonPos.x, skipButtonPos.y, "Done Shopping", ...);
const cells = groceryGrid(vm.items.length);
renderTimerBar(this, timerBar.x, timerBar.y, timerBar.width, timerBar.height, ...);
```

This ensures buttons, grids, and text are positioned relative to parent rects, making overlap bugs structurally impossible.

## State Management

**Phaser Registry** (`this.registry`) for cross-scene state:

| Key | Type | Set by |
|-----|------|--------|
| `"saveStore"` | `SaveStore` | TitleScene init, `persistSnapshot`, `recordSceneEntry` |
| `"activeSlotId"` | `string` | Menu selection |
| `"wallet"` | `Wallet` | Menu selection, day-end earnings |
| `"leaderboard"` | `Leaderboard` | TitleScene init, RestaurantScene day end |
| `"dayCycle"` | `DayCycle` | TitleScene, LoadGameScene, scene `update()` loops |
| `"inventory"` | `Inventory` | Menu selection (load), GroceryScene, KitchenScene, RestaurantScene |

Scenes read wallet with fallback: `this.registry.get("wallet") ?? initialWallet`.

## Persistence (localStorage)

- **Save key:** `"the-kitchen-competition"` (exported as `SAVE_KEY`).
- **Format:** v2 `SaveStore` with multiple `SaveSlot` entries. Slots now include optional `phase` (full Phase union) and `inventory` for mid-day state persistence.
- **Auto-save** via TitleScene `persistSnapshot()`:
  - Registered on both `setdata-*` and `changedata-*` for wallet, dayCycle, and inventory (fixes the `setdata` vs `changedata` bug where initial values weren't saved).
  - Builds a full `SaveSlotPatch` via `snapshotSlotPatch(wallet, dayCycle, inventory)` and patches the active slot.
  - `setdata-saveStore` + `changedata-saveStore` → `localStorage.setItem(SAVE_KEY, serializeStore(store))`
- **Scene tracking:** Gameplay scenes call `recordSceneEntry` on create.
- **Load on startup:** `loadStore()` tries v2 parse → v1 migration → empty store.
- **Load path:** All load handlers (TitleScene Continue, LoadGameScene slot click, PauseScene Load) reconstruct `DayCycle` from persisted `phase`, restore inventory, and route to the correct scene via `activeSceneForPhase`.
- **Backward compat:** v1 saves auto-migrate to v2 with one slot (burger, day 1). Old v2 saves without phase/inventory load with both `undefined` → defaults to day 1 grocery phase.

## Themed Assets (`public/assets/`)

- **Naming:** `{type}-{scene}-bg.png` for backgrounds, `{type}-table.png` for tables
- **Backgrounds (9):** `{burger,bbq,sushi}-{grocery,kitchen,restaurant}-bg.png`
- **Table sprites (3):** `{burger,bbq,sushi}-table.png` (transparent RGBA)
- **Legacy:** `grocery-bg.png`, `kitchen-bg.png`, `restaurant-bg.png` (kept as fallbacks, unused)
