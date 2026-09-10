import type { Line } from '../model/timeline.ts';
import { measureText } from '../text/measure.ts';
import { TYPOGRAPHY, type LayoutMetrics } from './metrics.ts';

export interface LegendEntry {
  /** Line whose colours the swatch uses. */
  readonly line: string;
  readonly label: string;
  /** Left end of the swatch. */
  readonly x: number;
  /** Vertical centre of the swatch. */
  readonly y: number;
  readonly swatchLength: number;
  readonly textX: number;
}

export interface Legend {
  readonly entries: readonly LegendEntry[];
  /** Where the map may start below the legend. */
  readonly bottom: number;
  readonly right: number;
}

const FIRST_ROW_Y = 20;
const ROW_HEIGHT = 24;
const SWATCH_LENGTH = 22;
const SWATCH_TO_TEXT = 10;
const ENTRY_GAP = 28;
const SPACE_BELOW = 44;

/**
 * One entry per distinct line style, so two "AWS" lines with the same colours share an entry.
 * Entries flow left to right and wrap before `limit`.
 */
export function layoutLegend(
  lines: readonly Line[],
  limit: number,
  metrics: LayoutMetrics,
): Legend {
  const seen = new Set<string>();
  const entries: LegendEntry[] = [];
  let x = metrics.margin;
  let y = FIRST_ROW_Y;
  let right = 0;

  for (const line of lines) {
    const { label } = line;
    if (label === undefined) continue;
    const key = JSON.stringify([label, line.color, line.darkColor]);
    if (seen.has(key)) continue;
    seen.add(key);

    const width = SWATCH_LENGTH + SWATCH_TO_TEXT + measureText(label, TYPOGRAPHY.legend);
    if (x > metrics.margin && x + width > limit) {
      x = metrics.margin;
      y += ROW_HEIGHT;
    }
    entries.push({
      line: line.id,
      label,
      x,
      y,
      swatchLength: SWATCH_LENGTH,
      textX: x + SWATCH_LENGTH + SWATCH_TO_TEXT,
    });
    right = Math.max(right, x + width);
    x += width + ENTRY_GAP;
  }

  return { entries, bottom: y + SPACE_BELOW, right };
}
