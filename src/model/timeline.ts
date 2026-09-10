import type { YearMonth } from './date.ts';

/** Id of the implicit line every other line ultimately branches from: the person. */
export const MAIN_LINE_ID = 'main';

export interface Station {
  readonly title: string;
  /** Text shown in the period column: the user's `period`, or their own dates as written. */
  readonly period: string;
  readonly org?: string;
  readonly subtitle?: string;
  readonly tags: readonly string[];
  readonly from: YearMonth;
}

export interface Line {
  readonly id: string;
  /** Legend label. Only the main line may have none, and then it is left out of the legend. */
  readonly label?: string;
  readonly color: string;
  readonly darkColor?: string;
  /** `null` only for the main line. */
  readonly parent: string | null;
  /** Distance from the main line in the parent tree (main = 0). */
  readonly depth: number;
  readonly start: YearMonth;
  /** Latest station date. Ongoing lines never merge back, whatever this says. */
  readonly end: YearMonth;
  readonly ongoing: boolean;
  /** Sorted by `from`; stations sharing a date keep their config order. */
  readonly stations: readonly Station[];
  /** Position in the config, used as the final tie-breaker so layouts are deterministic. */
  readonly order: number;
}

/** A validated career, independent of how it was written down. */
export interface Timeline {
  readonly title?: string;
  /** Whether the map is drawn newest first, like most CVs, instead of oldest first. */
  readonly reversed: boolean;
  /** Label of the station where the main line begins: at the top, or at the bottom if reversed. */
  readonly origin?: string;
  /** The main line first, then the other lines in config order. */
  readonly lines: readonly Line[];
}
