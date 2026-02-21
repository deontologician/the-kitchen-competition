# The Kitchen Competition

## Game Overview

A restaurant management game built with Phaser 3 + TypeScript + Vite. Players compete by running different restaurant types through a core day loop: shop for ingredients (30s grocery phase), prep in the kitchen (30s), then serve customers at the restaurant (120s service phase with order → cook → serve sub-cycle). Each day ends with an earnings summary (5 coins per customer served), then the next day starts.

## Roadmap

Future features, improvements, and known bugs are tracked in [`PLANNING.md`](PLANNING.md).

## Architecture: Domain / Rendering Split

- **`src/domain/`** — Pure TypeScript game logic. **Zero Phaser imports.** This is what we TDD.
- **`src/scenes/`** — Thin Phaser rendering layer that consumes domain logic via interfaces.

This separation is non-negotiable. Domain code must be testable without any game framework.

Detailed module docs live in each directory's own `CLAUDE.md`:
- [`src/domain/CLAUDE.md`](src/domain/CLAUDE.md) — Domain modules, view models, testing
- [`src/scenes/CLAUDE.md`](src/scenes/CLAUDE.md) — Scenes, helpers, state management, persistence, assets
- [`tools/CLAUDE.md`](tools/CLAUDE.md) — Gemini image generation tool

## Development Methodology: Strict TDD + Post-Feature Refactoring

1. **Tests first, always.** Write a failing test before writing any domain code.
2. Red → Green → Refactor. No exceptions.
3. Every domain function must have corresponding tests.
4. **Commit on green.** After each meaningful green step (tests pass + TS compiles), make a git commit with a descriptive message explaining the *why* of the change.
5. **After every plan implementation, update the relevant CLAUDE.md files** to reflect new/changed modules, scenes, registry keys, and architecture decisions so the documentation stays current.
6. **Commit at the end of every plan implementation.** Once CLAUDE.md files are updated and all tests pass, make a final git commit covering any remaining changes. Every plan should end with a clean working tree (relative to plan-related files).

### Post-Feature Refactoring Phase

After each feature is implemented and proven working (playtested, fun, tests green), run a dedicated refactoring pass:

1. **Discover algebras.** Look for common patterns across the domain — shared shapes, repeated transformations, composable operations. Extract these into clean algebraic structures.
2. **Compactify.** Reduce code volume by finding the elegant core. If three modules do similar things, unify them. The goal is minimal, expressive domain code.
3. **Strengthen types.** Make illegal states unrepresentable, use branded types where it helps, prefer literal unions over loose strings.
4. **Preserve behavior.** All existing tests must still pass. Add new tests only if the refactoring reveals untested invariants.
5. **Commit the refactoring separately.** Refactoring commits should be clearly labeled as such so they're distinct from feature work in the git history.

## Coding Conventions

- Export only **interfaces + factory functions**. Keep concrete types internal.
- Prefer small, focused modules. One concept per file.
- **No `for` loops.** Use `map`, `filter`, `reduce`, `flatMap`, etc.
- **Minimize mutation.** `readonly` on all interface properties by default.
- **Discriminated unions** for state modeling with exhaustive `never` checks.
- Pure functions wherever possible. Side effects at the edges only.
- Prefer `interface` over `type` for object shapes. Use `as const` for literal types.
- No `any`. Use `unknown` if the type is truly unknown.
- **Vitest** + **fast-check** for testing. Mix example-based and property-based tests.
- Test files in `src/domain/__tests__/` matching `*.test.ts`. Coverage scoped to `src/domain/` only.

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
      view/        # View model test files
    view/          # Pure view model layer (domain → scene bridge)
  scenes/          # Phaser scenes (thin rendering layer)
  main.ts          # Phaser game entry point
tools/
  gemini-image.mjs # CLI tool for generating game assets via Gemini API
public/
  assets/          # Generated game assets (images, animation frames)
    items/         # 74 item icon sprites (64x64, transparent PNG)
```

### Game Config (`src/main.ts`)
- 800x600 canvas, `pixelArt: true`, background `#1d1d2e`
- Scene order: Title → Grocery → Kitchen → Restaurant → LoadGame → Pause

## Deployment

- **Hosted at:** `https://deontologician.github.io/the-kitchen-competition/`
- **Method:** `npm run deploy` builds with Vite and pushes `dist/` to the `gh-pages` branch via the `gh-pages` npm package. No GitHub Actions needed.
- **Vite base path:** `base: "/the-kitchen-competition/"` in `vite.config.ts` ensures asset URLs resolve correctly on GitHub Pages.
- **GitHub Pages source:** `gh-pages` branch, root (`/`).
