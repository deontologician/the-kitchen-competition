# Implementation Plan: Complete Game Loop

## Goal
Build a complete restaurant management game where players:
1. **Shop** for raw ingredients during the grocery phase
2. **Prep/Cook** ingredients into intermediates during kitchen prep
3. **Serve** customers by taking orders, cooking dishes, and delivering them

## Current State (as of latest session)
- **Phases 1-3 COMPLETE**: inventory in registry, grocery purchasing UI, kitchen prep with recipe crafting
- **Phase 4 IN PROGRESS**: Service phase with real customer orders
- All 345 domain tests passing
- All scenes compile and are playtested via Playwright

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

### Phase 4: Service Phase - Real Customer Orders 🔄 IN PROGRESS
**What's done:**
- [x] `Order` type has `dishId` field (commit `88bbfdc`)
- [x] `Customer` type has `dishId` field (just added, not yet committed)
- [x] All existing tests updated with dishId on Customer/Order

**What's left to do:**
- [ ] RestaurantScene: spawn customers with `pickRandomDish` to get their dishId
- [ ] RestaurantScene: show what dish each customer ordered (order bubble)
- [ ] RestaurantScene: "Take Order" → `beginCooking` with customer's dishId
- [ ] KitchenScene (service cooking mode): show recipe chain for the ordered dish
  - If dish is already in inventory, auto-serve
  - If not, show recipe steps player needs to execute
  - Player can execute prep/cook steps during service cooking
- [ ] RestaurantScene: "Serve" button checks inventory for the dish, removes it
- [ ] Earnings: sell price from menu (not flat $5)

### Phase 5: Polish & Game Feel
- [ ] Ingredient expiration warnings
- [ ] Better visual feedback (animations)
- [ ] Customer patience timer
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
- `beginCooking(phase, orderId, dishId)` — now takes dishId parameter

### Item Sprite Rendering
- All 74 items have PNGs at `public/assets/items/{itemId}.png` (64x64, transparent)
- Loaded in scene `preload()`, referenced as `item-${itemId}`

## Files Modified This Session
- `src/domain/day-cycle.ts` — Added dishId to Order and Customer
- `src/domain/__tests__/day-cycle.test.ts` — Updated all tests with dishId
- `src/scenes/GroceryScene.ts` — Complete rewrite with purchasing UI
- `src/scenes/KitchenScene.ts` — Complete rewrite with recipe crafting UI
- `src/scenes/TitleScene.ts` — Added inventory init
- `src/scenes/LoadGameScene.ts` — Added inventory init
- `src/scenes/RestaurantScene.ts` — Updated beginCooking call (TODO placeholder)
- `CLAUDE.md` — Added refactoring methodology
