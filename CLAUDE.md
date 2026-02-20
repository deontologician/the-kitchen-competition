# The Kitchen Competition

## Game Overview

A restaurant management game built with Phaser 3 + TypeScript + Vite. Players compete by running different restaurant types through a core loop of taking orders, cooking dishes, serving customers, and managing resources.

## Architecture: Domain / Rendering Split

- **`src/domain/`** — Pure TypeScript game logic. **Zero Phaser imports.** This is what we TDD.
- **`src/scenes/`** — Thin Phaser rendering layer that consumes domain logic via interfaces.

This separation is non-negotiable. Domain code must be testable without any game framework.

## Development Methodology: Strict TDD

1. **Tests first, always.** Write a failing test before writing any domain code.
2. Red → Green → Refactor. No exceptions.
3. Every domain function must have corresponding tests.

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
```

## Codebase Details

### Domain Modules (`src/domain/`)
- **`pixel-font.ts`** — 5x7 bitmap pixel font. Supports A-Z, 0-9, space, and `$` (coin icon). Exports: `getGlyph`, `layoutLines`, `measureLineWidth`, `computeCenterOffset`, `createDefaultLayoutConfig`.
- **`wallet.ts`** — Coin currency. `Wallet` interface with pure functions: `createWallet`, `initialWallet` (10 coins), `addCoins`, `spendCoins` (returns `undefined` if can't afford), `canAfford`, `formatCoins` (returns `"$N"` where `$` renders as coin icon).
- **`save-game.ts`** — localStorage persistence. Pure serialization/validation with `SaveData` interface (version + coins). Exports: `SAVE_KEY`, `createSaveData`, `serializeSave`, `deserializeSave` (returns `undefined` on invalid input), `saveDataToWallet`.
- **`money.ts`** — Cents-based money type (legacy/unused). `Money` interface with `createMoney`, `fromDollars`, `addMoney`, `subtractMoney`.

### Scenes (`src/scenes/`)
- **`TitleScene`** — Entry point. Loads title background/text images. Initializes wallet in Phaser registry (idempotent). Nav buttons to Grocery/Kitchen/Restaurant.
- **`GroceryScene`** — Grocery store. Displays pixel-art title + coin HUD (top-right). Nav buttons to other scenes.
- **`KitchenScene`** — Kitchen scene. Pixel-art title, no coin HUD. Nav buttons to other scenes.
- **`RestaurantScene`** — Restaurant scene. Pixel-art title + coin HUD (top-right). Nav buttons to other scenes.
- **`renderPixelText.ts`** — Rendering helper. `renderPixelText(scene, lines, options)` draws pixel font text with dark backdrop. Supports centered (`centerY`) or absolute (`x`/`y`) positioning. `addNavButton(scene, x, y, label, targetScene)` creates clickable scene-transition buttons.

### Game Config (`src/main.ts`)
- 800x600 canvas, `pixelArt: true`, background `#1d1d2e`
- Scene order: Title → Grocery → Kitchen → Restaurant

### State Management
- **Phaser Registry** (`this.registry`) for cross-scene state. Wallet is stored as `"wallet"` key.
- TitleScene initializes wallet on first visit; subsequent visits preserve existing value.
- Scenes read wallet with fallback: `this.registry.get("wallet") ?? initialWallet`.

### Persistence (localStorage)
- **Save key:** `"the-kitchen-competition"` (exported as `SAVE_KEY` from `save-game.ts`).
- **Auto-save:** TitleScene listens to `changedata-wallet` on the registry. Any `registry.set("wallet", ...)` call automatically persists to localStorage — no manual save needed.
- **Load on startup:** TitleScene reads localStorage on first visit, validates via `deserializeSave`, falls back to `initialWallet` if missing or corrupt.
- **Domain/rendering split preserved:** All serialization/validation is pure domain code in `save-game.ts`. Only `TitleScene` touches `localStorage`.

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
