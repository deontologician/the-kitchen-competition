# Implementation Plan: Complete Game Loop

## Goal
Build a complete restaurant management game where players:
1. **Shop** for raw ingredients during the grocery phase
2. **Prep/Cook** ingredients into intermediates during kitchen prep
3. **Serve** customers by taking orders, cooking dishes, and delivering them

## Current State (as of latest session)
- **Phases 1-5 MOSTLY COMPLETE**: Full game loop working with economy + patience
- All 362 domain tests passing
- All scenes compile and are playtested via Playwright
- Full serve flow verified: grocery → kitchen prep → service (order → cook → serve → day end with per-dish earnings)

## Implementation Phases

### Phase 1: Registry & Inventory Integration ✅ COMPLETE
- [x] Add `inventory` to Phaser registry (alongside wallet, dayCycle, saveStore)
- [x] Initialize empty inventory on new game / load game
- [x] Domain: no changes needed (inventory.ts already complete)
- Commits: `f2bdb6b`

### Phase 2: Grocery Scene - Item Purchasing ✅ COMPLETE
- [x] Show grid of available raw ingredients for the restaurant type
- [x] Each item shows: sprite icon, name, cost
- [x] Click to buy (deducts from wallet, adds to inventory)
- [x] Show current inventory count per item
- [x] Timer still counts down, auto-transition to kitchen
- Commits: `2f8e7a9`

### Phase 3: Kitchen Prep Scene - Recipe Execution ✅ COMPLETE
- [x] Show available recipes (green=craftable, grey=missing ingredients)
- [x] Each recipe shows: output icon, name, required inputs with counts, time
- [x] Click recipe to start prep/cooking (consumes inputs, shows progress bar)
- [x] On completion, add output to inventory
- [x] Show current inventory sidebar
- [x] Service-phase cooking mode shows ordered dish
- Commits: `f33e285`

### Phase 4: Service Phase - Real Customer Orders ✅ COMPLETE
- [x] `Order` and `Customer` types have `dishId` field (commit `88bbfdc`)
- [x] RestaurantScene: spawn customers with `pickRandomDish` to get their dishId
- [x] RestaurantScene: show what dish each customer ordered (order bubble)
- [x] RestaurantScene: "Take Order" → `beginCooking` with customer's dishId
- [x] KitchenScene: auto-detects dish in inventory → auto-serve; else show recipe steps
- [x] RestaurantScene: "Serve" button removes dish from inventory
- [x] Abandon order mechanic: "Skip" in restaurant, "Abandon Order" in kitchen (commit `2394ec8`)
- [x] Assembly recipes available during kitchen prep (commit `e760347`)
- [x] Earnings: per-dish sell price from menu (commit `da7aebb`)
- Commits: `295613f`, `0bd3db4`, `2394ec8`, `e760347`, `da7aebb`

### Phase 5: Polish & Game Feel ✅ MOSTLY COMPLETE
- [x] Economy rebalance: starting money $20, profitable sell prices (commit `77a3c7a`)
- [x] Inventory sidebar in restaurant scene (commit `768c96d`)
- [x] Customer patience timer with color-coded table tints (commit `df81f08`)
- [ ] Customer order bubbles over tables — **NEXT**
- [ ] Multiple simultaneous customers (parallel orders)
- [ ] Better visual feedback (animations, transitions)
- [ ] Score/rating system
- [ ] Tutorial overlay

### Phase 6: Post-Feature Refactoring
Per CLAUDE.md methodology:
- [ ] Discover algebras across domain modules
- [ ] Compactify domain code
- [ ] Strengthen types (branded IDs, etc.)
- [ ] Clean up scene code patterns

## Technical Notes

### Registry Keys
- `"inventory"` (`Inventory`) — Player's current ingredient/item stock
- `"wallet"` (`Wallet`) — Coin currency
- `"dayCycle"` (`DayCycle`) — Day/phase state machine
- `"saveStore"` (`SaveStore`) — All save slots
- `"activeSlotId"` (`string`) — Current save slot

### Key Domain Changes Made
- `Order.dishId` — tracks which dish a customer ordered
- `Customer.dishId` — tracks what dish a customer wants when they arrive
- `Customer.patienceMs` / `maxPatienceMs` — ticking patience with color feedback
- `beginCooking(phase, orderId, dishId)` — now takes dishId parameter
- `finishServing(phase, dishEarnings)` — accumulates per-dish earnings
- `tickCustomerPatience(phase, elapsedMs)` — decrements patience of queued customers
- `removeExpiredCustomers(phase)` — removes patience-expired customers and unseats them
- `createCustomer(id, dishId, patienceMs?)` — factory with default 60s patience

### Item Sprite Rendering
- All 74 items have PNGs at `public/assets/items/{itemId}.png` (64x64, transparent)
- Loaded in scene `preload()`, referenced as `item-${itemId}`

### Table Tint Color Coding
- White: empty table
- Green: customer with >50% patience remaining
- Yellow: customer with 25-50% patience
- Red: customer with <25% patience
- Blue: actively being served (taking order / cooking / serving)
