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

const classify3 = <T>(fraction: number, high: T, mid: T, low: T): T =>
  fraction > 0.5 ? high : fraction > 0.25 ? mid : low;

export const timerColor = (f: number): TimerColor =>
  classify3(f, "green", "yellow", "red");

export const freshnessLevel = (f: number): FreshnessLevel =>
  classify3(f, "fresh", "warning", "critical");

export const patienceLevel = (f: number): PatienceLevel =>
  classify3(f, "ok", "warning", "critical");
