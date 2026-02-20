# Implementation Plan: Complete Game Loop

## Goal
Build a complete restaurant management game where players:
1. **Shop** for raw ingredients during the grocery phase
2. **Prep/Cook** ingredients into intermediates during kitchen prep
3. **Serve** customers by taking orders, cooking dishes, and delivering them

## Current State
- Domain layer is comprehensive: items, recipes, inventory, menus, day-cycle all implemented and tested
- Scenes are stubs: timers count down but no actual gameplay mechanics
- 74 item sprites exist in `public/assets/items/` but are never rendered
- Inventory type exists but is never instantiated in gameplay

## Implementation Phases

### Phase 1: Registry & Inventory Integration ✅ COMPLETE
- [x] Add `inventory` to Phaser registry (alongside wallet, dayCycle, saveStore)
- [x] Initialize empty inventory on new game / load game
- [x] Domain: no changes needed (inventory.ts already complete)
- [x] Tests: verify inventory integration patterns

### Phase 2: Grocery Scene - Item Purchasing ✅ COMPLETE
- [x] Show grid of available raw ingredients for the restaurant type
- [x] Each item shows: sprite icon, name, cost
- [x] Click to buy (deducts from wallet, adds to inventory)
- [x] Show current inventory count per item
- [x] Show wallet balance (already exists)
- [x] Timer still counts down (already exists)
- [x] Auto-transition to kitchen when timer expires (already exists)

### Phase 3: Kitchen Prep Scene - Recipe Execution ✅ COMPLETE
- [x] Show available recipes for the restaurant type (filtered by what's in inventory)
- [x] Each recipe shows: output item icon, name, required inputs, time
- [x] Click recipe to start prep/cooking (consumes inputs, starts timer)
- [x] Show progress bar during prep/cook
- [x] On completion, add output to inventory
- [x] Show current inventory sidebar
- [x] Timer still counts down (already exists)
- [x] Auto-transition to service when timer expires (already exists)

### Phase 4: Service Phase - Real Customer Orders ✅ COMPLETE
- [x] Customer orders a specific dish (using pickRandomDish)
- [x] Show what dish the customer wants (speech bubble or order card)
- [x] "Cook" button takes you to kitchen in cooking mode
- [x] Kitchen cooking mode: show the specific dish's recipe chain
- [x] Player must execute recipe steps in order (or have prepped items ready)
- [x] When dish is complete, return to restaurant
- [x] "Serve" button delivers the dish and earns money
- [x] Multiple customers can be waiting simultaneously

### Phase 5: Polish & Game Feel
- [ ] Ingredient expiration warnings (items near shelf life)
- [ ] Better visual feedback (animations, sounds)
- [ ] Customer patience timer (leave if waited too long)
- [ ] Score/rating system
- [ ] Tutorial or help overlay for first-time players

## Technical Notes

### Registry Keys (additions)
- `"inventory"` (`Inventory`) — Player's current ingredient/item stock

### Item Sprite Rendering
- All 74 items have PNGs at `public/assets/items/{itemId}.png` (64x64, transparent)
- Load in scene preload, display as Phaser sprites/images

## Progress Log
- Phase 1: Started - adding inventory to registry
