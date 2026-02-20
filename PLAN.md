# Implementation Plan: Complete Game Loop

## Goal
Build a complete restaurant management game where players:
1. **Shop** for raw ingredients during the grocery phase
2. **Prep/Cook** ingredients into intermediates during kitchen prep
3. **Serve** customers by taking orders, cooking dishes, and delivering them

## Current State (as of latest session)
- **Phases 1-5 COMPLETE**: Full game loop polished with difficulty scaling
- All 372 domain tests passing across 13 test files
- All scenes compile and are playtested via Playwright
- Game features: grocery shopping, kitchen prep, service with order bubbles, patience timers, day scaling, enhanced day-end summary

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
- [x] `Order` and `Customer` types have `dishId` field
- [x] RestaurantScene: spawn customers with `pickRandomDish` to get their dishId
- [x] RestaurantScene: show what dish each customer ordered (order bubble)
- [x] RestaurantScene: "Take Order" → `beginCooking` with customer's dishId
- [x] KitchenScene: auto-detects dish in inventory → auto-serve; else show recipe steps
- [x] RestaurantScene: "Serve" button removes dish from inventory
- [x] Abandon order mechanic: "Skip" in restaurant, "Abandon Order" in kitchen
- [x] Assembly recipes available during kitchen prep
- [x] Earnings: per-dish sell price from menu
- Commits: `295613f`, `0bd3db4`, `2394ec8`, `e760347`, `da7aebb`

### Phase 5: Polish & Game Feel ✅ COMPLETE
- [x] Economy rebalance: starting money $20, profitable sell prices (commit `77a3c7a`)
- [x] Inventory sidebar in restaurant scene (commit `768c96d`)
- [x] Customer patience timer with color-coded table tints (commit `df81f08`)
- [x] Customer order bubbles + patience bars over tables (commit `d138bc7`)
- [x] "Serve Now" for pre-made dishes — skip kitchen trip (commit `8ae8529`)
- [x] Day-based difficulty scaling: faster spawns, shorter patience, more customers (commit `003826c`)
- [x] Day indicator in all timer bars ("DAY X - PHASE TIME") (commit `8035c50`)
- [x] Customer-left notifications with fade animation (commit `8035c50`)
- [x] Customers lost tracking in domain + enhanced day-end summary (commit `05e1268`)
- [x] Refactored RestaurantScene helpers (commit `6cbdb3d`)

### Phase 6: Polish & Content ✅ MOSTLY COMPLETE
- [x] Ingredient expiration during service with visual warnings (commit `9ef2b9c`)
  - Items with shelfLifeMs expire in real-time during service/kitchen phases
  - Inventory sidebar color-codes items by freshness (white → yellow → red)
  - Notifications when items expire; domain `itemFreshness` function added
- [x] Tutorial / first-day guidance (commit `787fb85`)
  - Contextual TIP banners at bottom of each scene on Day 1 only
  - Auto-fades after 10 seconds
- [x] Customer arrival/serve/departure animations (commit `4aeb1ca`)
  - Table bounce on customer arrival, "+$" float + pop on serve
  - Red flash on tables when patience-expired customers leave
- [x] High score / leaderboard tracking (commit `cd603fd`)
  - Tracks best day served/earnings, total customers, total days played
  - Persisted to localStorage, shown on title screen
- [ ] Sound effects (deferred — requires audio assets)

### Phase 7: Post-Feature Refactoring ✅ COMPLETE
Per CLAUDE.md methodology:
- [x] Discover algebras across domain modules — analysis found domain code already well-factored; no forced abstractions needed
- [x] Compactify domain code — covered by algebra analysis; modules are already minimal
- [x] Strengthen types (branded IDs) — `CustomerId`, `OrderId`, `SlotId`, `ItemId` branded types (commit `1c2560e`)
- [x] Clean up scene code patterns — RestaurantScene 963→707 lines, extracted notification/inventorySidebar/tableRenderer/serviceAnimations (commit `1fdd465`)

## Technical Notes

### Registry Keys
- `"inventory"` (`Inventory`) — Player's current ingredient/item stock
- `"wallet"` (`Wallet`) — Coin currency
- `"dayCycle"` (`DayCycle`) — Day/phase state machine
- `"saveStore"` (`SaveStore`) — All save slots
- `"activeSlotId"` (`string`) — Current save slot

### Key Domain Functions
- `createCustomer(id, dishId, patienceMs?)` — factory with default 60s patience
- `beginCooking(phase, orderId, dishId)` — takes dishId parameter
- `finishServing(phase, dishEarnings)` — accumulates per-dish earnings
- `tickCustomerPatience(phase, elapsedMs)` — decrements patience of queued customers
- `removeExpiredCustomers(phase)` — removes patience-expired, unseats, increments customersLost
- `difficultyForDay(day)` — returns spawn intervals, patience ranges, max customers

### Item Sprite Rendering
- All 74 items have PNGs at `public/assets/items/{itemId}.png` (64x64, transparent)
- Loaded in scene `preload()`, referenced as `item-${itemId}`

### Table Tint Color Coding
- White: empty table
- Green: customer with >50% patience remaining
- Yellow: customer with 25-50% patience
- Red: customer with <25% patience
- Blue: actively being served (taking order / cooking / serving)

### Difficulty Scaling (per day)
| Day | Spawn Interval | Patience Range | Max Customers |
|-----|---------------|----------------|---------------|
| 1   | 10-15s        | 45-75s         | 8             |
| 3   | 8.6-13.6s     | 39-69s         | 12            |
| 5   | 7.2-12.2s     | 33-63s         | 16            |
| 10  | 3.7-8.7s      | 18-48s         | 26            |
| 15+ | 3-5s (floor)  | 15-30s (floor) | 30 (cap)      |
