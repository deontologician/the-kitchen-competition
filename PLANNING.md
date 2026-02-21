# Planning

Future ideas, improvements, and features to consider.

## Features

### Front of House / Back of House Split
**Priority: High | Effort: Large**

The biggest architectural change. The service phase becomes two persistent, concurrent locations the player moves between — **not** triggered by individual orders. Both keep simulating when the player isn't looking.

**Front of house (restaurant floor):**
- Take orders from seated customers (takes a few seconds per table).
- Deliver finished dishes from the "order up" zone (takes a few seconds).
- Customers keep arriving and patience keeps ticking even when you're in the back.

**Back of house (kitchen):**
- Five zones: **Refrigerator** (raw ingredient storage), **Cutting Board** (prep work), **Stove** (pan cooking), **Oven** (baking/roasting), **Order Up** (finished dishes ready for front of house).
- Each zone can have items in progress simultaneously.
- **Prep is manual / hold-to-work**: you hold down on an item at the cutting board to keep chopping. Let go and it stays at its current progress. Passive stations (oven, stove) keep cooking on their own.
- The full order queue is visible in the kitchen so you can batch-prep: "3 burger orders incoming, start all the patties."

**Movement:**
- Explicit "Go to Kitchen" / "Go to Floor" button — not tied to a specific order.
- Both worlds keep running. Food keeps cooking, customers keep waiting.
- Creates the core tension: every second in the kitchen is a second not serving customers.

**Domain model changes:**
- Replace the single `subPhase` state machine with per-table order statuses (waiting, taken, cooking, ready) and per-station kitchen state.
- The `ServicePhase` tracks both front-of-house and back-of-house state simultaneously.
- Kitchen stations are a new domain concept with their own progress timers.

This subsumes the old "Parallel Kitchen Work" and "Service Phase Timing" ideas.

### Hire Staff
**Priority: Medium | Effort: Large**

Hire employees that automate parts of the day loop. Becomes much more meaningful with the front/back split:

- **Prep Cook** — Works a kitchen station at a set rate. Frees the player for other stations or the floor.
- **Waiter** — Takes orders and delivers dishes on the floor. Covers front of house while you're in the kitchen.
- Staff costs money (daily wage? one-time hire?), creating an economic trade-off.
- Could unlock staff slots progressively as the restaurant grows.

### Player-Controlled Menu (UI only)
**Priority: Medium | Effort: Small**

Domain logic is already implemented (`toggleDish`, `enabledDishIds`, `disabledDishes` on `SaveSlot`). What's missing is the **in-game UI** to toggle dishes — a menu management screen accessible from the grocery or kitchen phase where the player can enable/disable dishes.

### Delete Save Slots (UI only)
**Priority: Medium | Effort: Small**

Domain function `removeSlot` already exists in `save-slots.ts`. What's missing is the **UI** — a trashcan icon next to each save slot in `LoadGameScene` with a confirmation prompt before deleting.

### Proper Coin Icon
**Priority: Low | Effort: Small**

Replace the `$` sign everywhere with a proper pixel-art coin sprite. Currently money uses `$` rendered via the bitmap font — but the game has coins, not dollars.

- Generate a small coin icon (e.g. 16x16 or 24x24 pixel art) using Gemini image tool.
- Use it as an inline sprite next to coin amounts in the HUD, grocery store prices, day-end summary, etc.
- Remove the `$` glyph from `pixel-font.ts` or just stop using it for currency display.
- Update `formatCoins` in `wallet.ts` to return just the number; let the rendering layer pair it with the coin sprite.

### Recipe Dependency Tree View
**Priority: Medium | Effort: Medium**

Show recipes as a visual tree of ingredient dependencies rather than a flat list. The domain already has the tree structure (`foldRecipeTree` catamorphism, `flattenRecipeChain`). The UI should render it as a tree: e.g. Burger → Bun + Patty (→ Raw Beef) + Lettuce (→ Raw Lettuce) so the player can see the full production chain at a glance. Helps with planning what to buy and what to prep first.

## Improvements

### Show Freshness in Grocery Store
**Priority: Medium | Effort: Small**

Item counts already show in the grocery grid. What's missing is **freshness info** for items the player already owns — so they can see "I have 2 beef but they expire soon, better buy more." Could add freshness bars to the count badges or show a small inventory panel.

### Freshness Progress Bars Instead of Red Text
**Priority: Medium | Effort: Small**

Replace the current red text color-coding for item freshness with a small shrinking progress bar on each item. The bar starts full (green) and shrinks toward zero as the item approaches expiry. More intuitive and visually clear than just changing the text color. Should apply everywhere inventory items are shown (kitchen, restaurant sidebar, grocery store if inventory is displayed there).

## Bugs / Tech Debt

### Save/load roundtrip tests
**Priority: High | Effort: Medium**

Basic serialization roundtrip tests exist for `SaveStore` and `SaveSlot`. What's missing is **full game state roundtrip testing** — generating realistic in-progress game states and verifying everything survives:

- Prep/cooking progress on in-flight recipes preserved (partially chopped lettuce stays partially chopped).
- Item expiration timers resume correctly relative to elapsed time, not reset.
- Day cycle phase, sub-phase, earnings, customers served/lost all restored.
- View models produce the same output before save and after load.

### Update balance sim to use view models
**Priority: Medium | Effort: Medium**

The balance sim (`balance-sim.ts`) runs a pure economy simulation but doesn't go through the view model layer. It should use the same VMs that scenes use (`groceryVM`, `kitchenVM`, `restaurantVM`, `dayEndVM`) so the simulation reflects what the player actually sees and can do — e.g. affordability checks, craftability, dish unlock decisions. If the VMs ever diverge from raw domain logic, the sim would silently test the wrong thing.

### Disabled menu items reset and still get ordered
**Priority: High | Effort: Small**

Two issues:
1. The grocery scene resets the menu back to fully enabled partway through, wiping out the player's disabled dishes.
2. Even when set, `pickRandomDish` in `RestaurantScene.spawnCustomer()` likely isn't filtering by disabled dishes.
3. The disabled dishes list may not be persisting through save/load — ensure `disabledDishes` on `SaveSlot` is correctly saved and restored.

### Kitchen ingredient list can't scroll
**Priority: High | Effort: Small**

The recipe/ingredient list in the kitchen scene overflows off-screen when there are many items. No scrolling is implemented, so items pushed below the visible area are completely inaccessible. Need to add scrolling (scroll wheel, drag, or arrow buttons) to the ingredient/recipe panel.

### Regenerate beef patty icon
**Priority: Low | Effort: Small**

The beef patty sprite (`public/assets/items/beef-patty.png`) has white dot artifacts from the magenta flood-fill transparency process. Regenerate it with the Gemini image tool using `--transparent`.
