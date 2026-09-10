import { linePalette, type LinePalette, type Theme } from '../color/theme.ts';
import type { Bridge, Point, Track } from '../layout/geometry.ts';
import type { Label, TextBox } from '../layout/labels.ts';
import type { Layout, StationMark } from '../layout/layout.ts';
import { TYPOGRAPHY } from '../layout/metrics.ts';
import { element, escapeXml, formatNumber } from './xml.ts';

const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif';
const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const STOP = { radius: 5.5, strokeWidth: 3.2 } as const;
const ORIGIN = { radius: 8, strokeWidth: 4 } as const;
/** Extra background drawn on each side of a bridge so the line below visibly passes under. */
const BRIDGE_CASING = 3;
const TAIL_DASH = '0 12';
const CHIP_RADIUS = 4;

/** Draws a layout in one theme. Pure: the same layout and theme always give the same string. */
export function renderSvg(layout: Layout, theme: Theme): string {
  const palettes = new Map(layout.lines.map((line) => [line.id, linePalette(line, theme)]));
  const palette = (id: string): LinePalette => {
    const found = palettes.get(id);
    if (!found) throw new Error(`no colours for line "${id}"`);
    return found;
  };

  const strokeProps = (color: string) => ({
    fill: 'none',
    stroke: color,
    'stroke-width': layout.strokeWidth,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  const legend = layout.legend.map((entry) =>
    [
      element('line', {
        x1: entry.x,
        y1: entry.y,
        x2: entry.x + entry.swatchLength,
        y2: entry.y,
        ...strokeProps(palette(entry.line).stroke),
      }),
      element(
        'text',
        { x: entry.textX, y: entry.y + 5, 'font-size': TYPOGRAPHY.legend.size, fill: theme.muted },
        escapeXml(entry.label),
      ),
    ].join(''),
  );

  const tails = layout.tracks.flatMap(({ line, tail }) =>
    tail
      ? [
          element('line', {
            x1: tail.from.x,
            y1: tail.from.y,
            x2: tail.to.x,
            y2: tail.to.y,
            ...strokeProps(palette(line).stroke),
            'stroke-dasharray': TAIL_DASH,
          }),
        ]
      : [],
  );

  // Deepest lines first, so every line passes under its parent where they join, and the parent
  // covers the round cap. Sorting is stable, so siblings keep their config order.
  const paintOrder = layout.tracks.toSorted((a, b) => b.depth - a.depth);
  const tracks = paintOrder.map((track: Track) =>
    element('path', {
      d: roundedPath(track.points, layout.cornerRadius),
      ...strokeProps(palette(track.line).stroke),
    }),
  );

  const bridges = layout.bridges.flatMap((bridge: Bridge) => [
    element('line', {
      ...segment(bridge),
      ...strokeProps(theme.background),
      'stroke-width': layout.strokeWidth + 2 * BRIDGE_CASING,
      'stroke-linecap': 'butt',
    }),
    element('line', {
      ...segment(bridge),
      ...strokeProps(palette(bridge.line).stroke),
      'stroke-linecap': 'butt',
    }),
  ]);

  const stations = layout.stations.map((station) => renderStation(station, theme, palette));
  const labels = layout.stations.map((station) => renderLabel(station, theme, palette));

  return (
    element(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: layout.width,
        height: layout.height,
        viewBox: `0 0 ${formatNumber(layout.width)} ${formatNumber(layout.height)}`,
        role: 'img',
        'font-family': SANS,
      },
      [
        layout.title === undefined ? '' : element('title', {}, escapeXml(layout.title)),
        group('legend', legend),
        group('tails', tails),
        group('tracks', tracks),
        group('bridges', bridges),
        group('stations', stations),
        group('labels', labels),
      ],
    ) + '\n'
  );
}

function renderStation(
  station: StationMark,
  theme: Theme,
  palette: (id: string) => LinePalette,
): string {
  const style = station.kind === 'origin' ? ORIGIN : STOP;
  return element('circle', {
    cx: station.at.x,
    cy: station.at.y,
    r: style.radius,
    fill: theme.background,
    stroke: palette(station.line).stroke,
    'stroke-width': style.strokeWidth,
  });
}

function renderLabel(
  station: StationMark,
  theme: Theme,
  palette: (id: string) => LinePalette,
): string {
  const colors = palette(station.line);
  const { period, org, title, subtitle, chips }: Label = station.label;
  const text = (box: TextBox, attributes: Record<string, string | number>) =>
    element('text', { x: box.x, y: box.y, ...attributes }, escapeXml(box.text));

  return [
    period &&
      text(period, {
        'font-size': TYPOGRAPHY.period.size,
        'font-weight': 700,
        fill: colors.period,
      }),
    org && text(org, { 'font-size': TYPOGRAPHY.secondary.size, fill: theme.muted }),
    text(title, { 'font-size': TYPOGRAPHY.title.size, 'font-weight': 600, fill: theme.text }),
    subtitle && text(subtitle, { 'font-size': TYPOGRAPHY.secondary.size, fill: theme.muted }),
    ...chips.map((chip) =>
      [
        element('rect', {
          x: chip.x,
          y: chip.y,
          width: chip.width,
          height: chip.height,
          rx: CHIP_RADIUS,
          fill: colors.chipFill,
          stroke: colors.chipStroke,
        }),
        element(
          'text',
          {
            x: chip.textX,
            y: chip.textY,
            'font-family': MONO,
            'font-size': TYPOGRAPHY.tag.size,
            fill: theme.text,
          },
          escapeXml(chip.text),
        ),
      ].join(''),
    ),
  ]
    .filter((part) => part !== undefined)
    .join('');
}

/** SVG path through `points`, with each corner rounded by up to `radius`. */
export function roundedPath(points: readonly Point[], radius: number): string {
  // A repeated point would make a zero-length segment, which has no direction to round along.
  const distinct = points.filter((point, i) => {
    const previous = points[i - 1];
    return !previous || distance(previous, point) > 0;
  });
  const [first, ...rest] = distinct;
  if (!first) return '';
  const commands = [`M${formatPoint(first)}`];

  for (let i = 1; i < distinct.length - 1; i++) {
    const previous = distinct[i - 1];
    const corner = distinct[i];
    const next = distinct[i + 1];
    if (!previous || !corner || !next) continue;
    const incoming = distance(previous, corner);
    const outgoing = distance(corner, next);
    // Never round more than half a segment, so neighbouring corners cannot overlap.
    const r = Math.min(radius, incoming / 2, outgoing / 2);
    const enter = towards(corner, previous, r / incoming);
    const leave = towards(corner, next, r / outgoing);
    commands.push(`L${formatPoint(enter)}`, `Q${formatPoint(corner)} ${formatPoint(leave)}`);
  }

  const last = rest.at(-1);
  if (last) commands.push(`L${formatPoint(last)}`);
  return commands.join(' ');
}

function group(name: string, children: readonly string[]): string {
  return children.length === 0 ? '' : element('g', { class: name }, children);
}

function segment({ from, to }: { readonly from: Point; readonly to: Point }) {
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
}

function towards(from: Point, to: Point, fraction: number): Point {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function formatPoint({ x, y }: Point): string {
  return `${formatNumber(x)},${formatNumber(y)}`;
}
