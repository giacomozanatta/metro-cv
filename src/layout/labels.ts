import type { Station } from '../model/timeline.ts';
import { measureText } from '../text/measure.ts';
import { TYPOGRAPHY, type LayoutMetrics } from './metrics.ts';

/** A single line of text; `y` is the baseline. */
export interface TextBox {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/** A tag drawn as a rounded box; `x`/`y` is the box's top-left corner. */
export interface Chip {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly textX: number;
  readonly textY: number;
}

export interface Label {
  readonly period?: TextBox;
  readonly org?: TextBox;
  readonly title: TextBox;
  readonly subtitle?: TextBox;
  readonly chips: readonly Chip[];
}

/** A label positioned relative to its station's centre (y = 0), plus its vertical extent. */
export interface LabelShape {
  readonly label: Label;
  /** How far the label reaches above the station's centre. */
  readonly above: number;
  /** How far the label reaches below the station's centre. */
  readonly below: number;
  /** Rightmost x of any text or chip. */
  readonly right: number;
}

/** x positions of the two label columns shared by every station. */
export interface Columns {
  readonly period: number;
  readonly title: number;
}

// Vertical rhythm, relative to the station's centre. With a second row, the title sits just above
// the centre and the second row (org, subtitle or chips) just below; a lone title is centred.
const TITLE_CAP_HEIGHT = 11;
const TITLE_BASELINE_ALONE = 5;
const TITLE_BASELINE_WITH_ROW = -3;
const TEXT_DESCENT = 4;
const SECOND_ROW_BASELINE = 15;
const CHIP = { top: 5, height: 18, gap: 6, rowGap: 6, paddingX: 7, baseline: 13 } as const;

export function computeColumns(
  stations: readonly Station[],
  laneCount: number,
  metrics: LayoutMetrics,
): Columns {
  const period = metrics.left + (laneCount - 1) * metrics.laneSpacing + metrics.laneToLabelGap;
  const widest = stations.reduce(
    (max, s) =>
      Math.max(
        max,
        measureText(s.period, TYPOGRAPHY.period),
        s.org === undefined ? 0 : measureText(s.org, TYPOGRAPHY.secondary),
      ),
    0,
  );
  return { period, title: period + Math.ceil(widest) + metrics.columnGap };
}

export function shapeStationLabel(
  station: Station,
  columns: Columns,
  metrics: LayoutMetrics,
): LabelShape {
  const hasSecondRow =
    station.org !== undefined || station.subtitle !== undefined || station.tags.length > 0;
  const titleY = hasSecondRow ? TITLE_BASELINE_WITH_ROW : TITLE_BASELINE_ALONE;

  const title: TextBox = { text: station.title, x: columns.title, y: titleY };
  const period: TextBox = { text: station.period, x: columns.period, y: titleY };
  const org: TextBox | undefined =
    station.org === undefined
      ? undefined
      : { text: station.org, x: columns.period, y: SECOND_ROW_BASELINE };
  const subtitle: TextBox | undefined =
    station.subtitle === undefined
      ? undefined
      : { text: station.subtitle, x: columns.title, y: SECOND_ROW_BASELINE };
  const chips = wrapChips(station.tags, columns.title, metrics.maxWidth - metrics.margin);

  const lastChip = chips.at(-1);
  const below = lastChip
    ? lastChip.y + lastChip.height
    : (hasSecondRow ? SECOND_ROW_BASELINE : titleY) + TEXT_DESCENT;

  const right = Math.max(
    title.x + measureText(title.text, TYPOGRAPHY.title),
    subtitle ? subtitle.x + measureText(subtitle.text, TYPOGRAPHY.secondary) : 0,
    ...chips.map((chip) => chip.x + chip.width),
  );

  return {
    label: {
      period,
      ...(org && { org }),
      title,
      ...(subtitle && { subtitle }),
      chips,
    },
    above: TITLE_CAP_HEIGHT - titleY,
    below,
    right,
  };
}

/** The label of the station at the top of the main line: a title and nothing else. */
export function shapeOriginLabel(text: string, columns: Columns): LabelShape {
  const title: TextBox = { text, x: columns.title, y: TITLE_BASELINE_ALONE };
  return {
    label: { title, chips: [] },
    above: TITLE_CAP_HEIGHT - TITLE_BASELINE_ALONE,
    below: TITLE_BASELINE_ALONE + TEXT_DESCENT,
    right: title.x + measureText(text, TYPOGRAPHY.title),
  };
}

/** Moves a label from station-relative to absolute coordinates. */
export function positionLabel(label: Label, centreY: number): Label {
  const move = (box: TextBox): TextBox => ({ ...box, y: box.y + centreY });
  return {
    ...(label.period && { period: move(label.period) }),
    ...(label.org && { org: move(label.org) }),
    title: move(label.title),
    ...(label.subtitle && { subtitle: move(label.subtitle) }),
    chips: label.chips.map((chip) => ({
      ...chip,
      y: chip.y + centreY,
      textY: chip.textY + centreY,
    })),
  };
}

/** Lays tags out left to right, starting a new row when the next chip would pass `limit`. */
function wrapChips(tags: readonly string[], left: number, limit: number): readonly Chip[] {
  const chips: Chip[] = [];
  let x = left;
  let y = CHIP.top;
  for (const text of tags) {
    const width = Math.ceil(measureText(text, TYPOGRAPHY.tag) + 2 * CHIP.paddingX);
    if (x > left && x + width > limit) {
      x = left;
      y += CHIP.height + CHIP.rowGap;
    }
    chips.push({
      text,
      x,
      y,
      width,
      height: CHIP.height,
      textX: x + CHIP.paddingX,
      textY: y + CHIP.baseline,
    });
    x += width + CHIP.gap;
  }
  return chips;
}
