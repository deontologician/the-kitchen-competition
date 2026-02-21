# Scenes Layer (`src/scenes/`)

**Hard rule: Thin rendering only.** Consume domain logic via view models. No business logic here.

## Scenes

- **`TitleScene`** — Entry point. Inits `saveStore` + `leaderboard` from localStorage. Menu: New Game (always), Continue + Load Game (if saves exist). New Game shows restaurant type picker (Burger/BBQ/Sushi). Leaderboard stats at bottom. Sets up three auto-save registry listeners (wallet, saveStore, dayCycle).
- **`LoadGameScene`** — Lists save slots sorted by recency via `formatSlotSummary`. Click loads slot → GroceryScene. Back → TitleScene.
- **`GroceryScene`** — 30s shopping phase. Uses `groceryVM` for item grid + `timerBarVM` for countdown. Panel overlay + pixel-art title + coin HUD. **"MENU ▼" button** opens `showMenuPanel()` overlay listing all unlocked dishes with ON/OFF toggles — clicking a dish calls `toggleDish`, saves via registry, and re-renders the grocery grid. Auto-transitions to KitchenScene on timer expiry. Calls `recordSceneEntry` on create. Esc → PauseScene.
- **`KitchenScene`** — Dual-mode. **Prep mode** (`kitchen_prep` phase): 30s countdown, auto-transitions to RestaurantScene. **Cooking mode** (`service` phase, `cooking` sub-phase): shows order details + recipe list. Uses `kitchenVM` for recipe craftability (filtered by `disabledDishes`). Service timer keeps ticking. Esc → PauseScene.
- **`RestaurantScene`** — Service phase hub. 2x3 table grid via `tablePositions()`. Uses `restaurantVM` for table status/action prompts + `dayEndVM` for summary. `difficultyForDay` drives spawns/patience. Auto-calls `beginTakingOrder` when waiting + queue non-empty. "Serve Now" (if dish in inventory) or "Cook Order" → KitchenScene. Day-end overlay with "Next Day" button. Coin HUD updates each frame showing wallet + current service earnings. Ends day early when `isRestaurantIdle` and inventory is empty. Esc → PauseScene.
- **`PauseScene`** — Esc-key overlay via `scene.launch()` + `scene.pause()`. Menus: Resume, Save, Load Game, Debug (Skip Phase, Add 50 Coins), Quit to Title. Pausing freezes `update()` and all Phaser timers.

## Scene Helpers

- **`renderPixelText.ts`** — `renderPixelText(scene, lines, options)` draws pixel font with backdrop; returns `Phaser.GameObjects.Graphics` so callers can destroy and redraw. `addNavButton` / `addMenuButton` for clickable buttons.
- **`timerBar.ts`** — `renderTimerBar(scene, ...)` → `TimerBarResult` (graphics + label). `TIMER_COLOR_HEX` maps colors. Re-exports `formatTimeRemaining`.
- **`panel.ts`** — `renderPanel(scene, spec, appearance?)` draws Phaser rounded rect via domain `resolvePanel`.
- **`restaurantTypeHelper.ts`** — `getActiveRestaurantType(registry)`, `getActiveUnlockedCount(registry)`, `getActiveDisabledDishes(registry)` (returns `slot.disabledDishes ?? []`). Asset key helpers: `backgroundKey(type, scene)` → `"burger-grocery-bg"`, `tableKey(type)` → `"burger-table"`, plus `*AssetPath` variants.
- **`saveHelpers.ts`** — `recordSceneEntry(registry, sceneKey)` updates active slot's scene + lastSaved. `recordDayAdvance(registry, day)` updates day.
- **`tutorialHint.ts`** — `showTutorialHint(scene, phaseTag)` shows TIP banner on Day 1 only. Auto-fades after 10s.
- **`notification.ts`** — `showNotification(scene, state, message, color)` renders fade-out alerts ("Customer left!", "Item expired!").
- **`inventorySidebar.ts`** — `renderInventorySidebar(scene, inventory, oldObjects)` renders right-aligned list with freshness color-coding.
- **`tableRenderer.ts`** — `renderTableOverlays(scene, phase, layout, oldBubbles)` renders table tints, order bubbles (32px dish sprites), patience bars.
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
| `"saveStore"` | `SaveStore` | TitleScene init, wallet listener, `recordSceneEntry`, `recordDayAdvance` |
| `"activeSlotId"` | `string` | Menu selection |
| `"wallet"` | `Wallet` | Menu selection, day-end earnings |
| `"leaderboard"` | `Leaderboard` | TitleScene init, RestaurantScene day end |
| `"dayCycle"` | `DayCycle` | TitleScene, LoadGameScene, scene `update()` loops |

Scenes read wallet with fallback: `this.registry.get("wallet") ?? initialWallet`.

## Persistence (localStorage)

- **Save key:** `"the-kitchen-competition"` (exported as `SAVE_KEY`).
- **Format:** v2 `SaveStore` with multiple `SaveSlot` entries.
- **Auto-save** via three TitleScene registry listeners:
  1. `changedata-wallet` → updates active slot coins + lastSaved → triggers saveStore write
  2. `changedata-saveStore` → `localStorage.setItem(SAVE_KEY, serializeStore(store))`
  3. `changedata-dayCycle` → updates active slot's day via `recordDayAdvance`
- **Scene tracking:** Gameplay scenes call `recordSceneEntry` on create.
- **Load on startup:** `loadStore()` tries v2 parse → v1 migration → empty store.
- **Backward compat:** v1 saves auto-migrate to v2 with one slot (burger, day 1).

## Themed Assets (`public/assets/`)

- **Naming:** `{type}-{scene}-bg.png` for backgrounds, `{type}-table.png` for tables
- **Backgrounds (9):** `{burger,bbq,sushi}-{grocery,kitchen,restaurant}-bg.png`
- **Table sprites (3):** `{burger,bbq,sushi}-table.png` (transparent RGBA)
- **Legacy:** `grocery-bg.png`, `kitchen-bg.png`, `restaurant-bg.png` (kept as fallbacks, unused)
