import type { TextStyle } from '../text/measure.ts';

/** Every distance the layout uses, in pixels. */
export interface LayoutMetrics {
  /** Horizontal distance between lanes, and so also the height of a one-lane 45° bend. */
  readonly laneSpacing: number;
  /** x of lane 0. */
  readonly left: number;
  /** Space kept free around the drawing. */
  readonly margin: number;
  readonly strokeWidth: number;
  readonly cornerRadius: number;
  /** Minimum vertical distance between a bend and a station on the same lane. */
  readonly stationGap: number;
  /** Minimum vertical gap between the label blocks of consecutive stations. */
  readonly labelGap: number;
  /** Gap between the outermost lane and the period column. */
  readonly laneToLabelGap: number;
  /** Gap between the period column and the title column. */
  readonly columnGap: number;
  /** Tag chips wrap onto new rows to keep the map within this width. */
  readonly maxWidth: number;
  /** Length of the dotted continuation drawn below ongoing lines. */
  readonly tailLength: number;
}

export const DEFAULT_METRICS: LayoutMetrics = {
  laneSpacing: 32,
  left: 40,
  margin: 16,
  strokeWidth: 7,
  cornerRadius: 10,
  stationGap: 22,
  labelGap: 16,
  laneToLabelGap: 36,
  columnGap: 24,
  maxWidth: 840,
  tailLength: 40,
};

/** Metrics that must be strictly positive; all others may also be zero. */
const POSITIVE_METRICS: ReadonlySet<keyof LayoutMetrics> = new Set([
  'laneSpacing',
  'strokeWidth',
  'maxWidth',
]);

/** Fills in defaults for missing (or explicitly `undefined`) metrics and rejects unusable ones. */
export function resolveMetrics(options: Partial<LayoutMetrics>): LayoutMetrics {
  const metrics: { -readonly [K in keyof LayoutMetrics]: number } = { ...DEFAULT_METRICS };
  for (const key of Object.keys(DEFAULT_METRICS) as (keyof LayoutMetrics)[]) {
    const value = options[key];
    if (value === undefined) continue;
    const positive = POSITIVE_METRICS.has(key);
    if (!Number.isFinite(value) || value < 0 || (positive && value === 0)) {
      throw new RangeError(
        `layout option "${key}" must be a ${positive ? 'positive' : 'non-negative'} number, got ${String(value)}`,
      );
    }
    metrics[key] = value;
  }
  return metrics;
}

/** Text styles; the layout measures with them and the renderer draws with them. */
export const TYPOGRAPHY = {
  title: { size: 14, weight: 'bold' },
  period: { size: 13, weight: 'bold' },
  secondary: { size: 12, weight: 'regular' },
  tag: { size: 11, weight: 'regular', monospace: true },
  legend: { size: 13, weight: 'regular' },
} as const satisfies Record<string, TextStyle>;
