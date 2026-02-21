import type { Wallet } from "./wallet";
import type { DayCycle } from "./day-cycle";
import { activeSceneForPhase } from "./day-cycle";
import type { Inventory } from "./inventory";
import type { SaveSlotPatch } from "./save-slots";

export const snapshotSlotPatch = (
  wallet: Wallet,
  dayCycle: DayCycle,
  inventory: Inventory,
  now?: number
): SaveSlotPatch => ({
  day: dayCycle.day,
  coins: wallet.coins,
  scene: activeSceneForPhase(dayCycle.phase),
  lastSaved: now ?? Date.now(),
  phase: dayCycle.phase,
  inventory,
});
