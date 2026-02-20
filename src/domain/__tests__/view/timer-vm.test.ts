import { describe, it, expect } from "vitest";
import { timerBarVM } from "../../view/timer-vm";
import type { Phase } from "../../day-cycle";

describe("timerBarVM", () => {
  it("returns undefined for day_end phase", () => {
    const phase: Phase = {
      tag: "day_end",
      customersServed: 5,
      customersLost: 1,
      earnings: 25,
    };
    expect(timerBarVM(phase, 3)).toBeUndefined();
  });

  it("produces SHOPPING label for grocery phase", () => {
    const phase: Phase = {
      tag: "grocery",
      remainingMs: 15_000,
      durationMs: 30_000,
    };
    const vm = timerBarVM(phase, 1);
    expect(vm).toBeDefined();
    expect(vm!.label).toBe("DAY 1 - SHOPPING 0:15");
    expect(vm!.fraction).toBe(0.5);
    expect(vm!.color).toBe("yellow");
  });

  it("produces PREPPING label for kitchen_prep phase", () => {
    const phase: Phase = {
      tag: "kitchen_prep",
      remainingMs: 25_000,
      durationMs: 30_000,
    };
    const vm = timerBarVM(phase, 2);
    expect(vm).toBeDefined();
    expect(vm!.label).toBe("DAY 2 - PREPPING 0:25");
    expect(vm!.fraction).toBeCloseTo(25_000 / 30_000);
    expect(vm!.color).toBe("green");
  });

  it("produces SERVICE label for service phase", () => {
    const phase: Phase = {
      tag: "service",
      remainingMs: 60_000,
      durationMs: 120_000,
      subPhase: { tag: "waiting_for_customer" },
      customersServed: 0,
      customersLost: 0,
      earnings: 0,
      customerQueue: [],
      tableLayout: { tables: [] },
    };
    const vm = timerBarVM(phase, 5);
    expect(vm).toBeDefined();
    expect(vm!.label).toBe("DAY 5 - SERVICE 1:00");
    expect(vm!.fraction).toBe(0.5);
    expect(vm!.color).toBe("yellow");
  });

  it("returns red color when time is low", () => {
    const phase: Phase = {
      tag: "grocery",
      remainingMs: 3_000,
      durationMs: 30_000,
    };
    const vm = timerBarVM(phase, 1);
    expect(vm!.color).toBe("red");
  });

  it("returns green color when time is high", () => {
    const phase: Phase = {
      tag: "grocery",
      remainingMs: 28_000,
      durationMs: 30_000,
    };
    const vm = timerBarVM(phase, 1);
    expect(vm!.color).toBe("green");
  });
});
