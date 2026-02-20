// Shared formatting utilities for view models.
// Pure functions — no Phaser imports.

export type TimerColor = "green" | "yellow" | "red";
export type FreshnessLevel = "fresh" | "warning" | "critical";
export type PatienceLevel = "ok" | "warning" | "critical";

export const formatTimeRemaining = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const truncateName = (name: string, maxLen: number): string =>
  name.length > maxLen ? name.slice(0, maxLen - 1) + "." : name;

export const timerColor = (fraction: number): TimerColor => {
  if (fraction > 0.5) return "green";
  if (fraction > 0.25) return "yellow";
  return "red";
};

export const freshnessLevel = (fraction: number): FreshnessLevel => {
  if (fraction > 0.5) return "fresh";
  if (fraction > 0.25) return "warning";
  return "critical";
};

export const patienceLevel = (fraction: number): PatienceLevel => {
  if (fraction > 0.5) return "ok";
  if (fraction > 0.25) return "warning";
  return "critical";
};
