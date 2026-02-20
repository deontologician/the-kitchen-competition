import type { Phase } from "../day-cycle";
import { timerFraction, isTimedPhase } from "../day-cycle";
import { formatTimeRemaining, timerColor, type TimerColor } from "./format";

export interface TimerBarVM {
  readonly fraction: number;
  readonly label: string;
  readonly color: TimerColor;
}

const phaseLabel = (phase: Phase): string => {
  switch (phase.tag) {
    case "grocery":
      return "SHOPPING";
    case "kitchen_prep":
      return "PREPPING";
    case "service":
      return "SERVICE";
    case "day_end":
      return "";
  }
};

export const timerBarVM = (
  phase: Phase,
  day: number
): TimerBarVM | undefined => {
  if (!isTimedPhase(phase)) return undefined;

  const fraction = timerFraction(phase);
  const label = `DAY ${day} - ${phaseLabel(phase)} ${formatTimeRemaining(phase.remainingMs)}`;

  return {
    fraction,
    label,
    color: timerColor(fraction),
  };
};
