import { MAIN_LINE_ID, type Timeline } from '../model/timeline.ts';
import { findCrossings } from './crossings.ts';
import {
  buildBridges,
  buildTracks,
  laneX,
  type Bridge,
  type Point,
  type Track,
} from './geometry.ts';
import {
  computeColumns,
  positionLabel,
  shapeOriginLabel,
  shapeStationLabel,
  type Label,
  type LabelShape,
} from './labels.ts';
import { assignLanes } from './lanes.ts';
import { layoutLegend, type LegendEntry } from './legend.ts';
import { resolveMetrics, type LayoutMetrics } from './metrics.ts';
import { orderEvents } from './order.ts';
import { placeVertically } from './vertical.ts';

export interface StationMark {
  readonly line: string;
  readonly kind: 'origin' | 'stop';
  readonly at: Point;
  readonly label: Label;
  /** Vertical extent of the label block. */
  readonly top: number;
  readonly bottom: number;
}

export interface LineStyle {
  readonly id: string;
  readonly color: string;
  readonly darkColor?: string;
}

/** Everything needed to draw the map, in absolute pixel coordinates. Theme-independent. */
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly title?: string;
  readonly strokeWidth: number;
  readonly cornerRadius: number;
  readonly lines: readonly LineStyle[];
  readonly legend: readonly LegendEntry[];
  /** Main line first, then the other lines in config order. */
  readonly tracks: readonly Track[];
  readonly bridges: readonly Bridge[];
  readonly stations: readonly StationMark[];
}

/** Computes the full geometry of a timeline. Pure and deterministic. */
export function layout(timeline: Timeline, options: Partial<LayoutMetrics> = {}): Layout {
  const metrics = resolveMetrics(options);

  const events = orderEvents(timeline);
  const assignment = assignLanes(timeline, events);
  const crossings = findCrossings(events, assignment);

  const columns = computeColumns(
    timeline.lines.flatMap((line) => line.stations),
    assignment.laneCount,
    metrics,
  );
  const shapes = new Map<number, LabelShape>();
  events.forEach((event, index) => {
    if (event.kind === 'station') {
      shapes.set(index, shapeStationLabel(event.station, columns, metrics));
    }
  });
  const origin =
    timeline.origin === undefined ? undefined : shapeOriginLabel(timeline.origin, columns);

  const labelsRight = Math.max(
    origin?.right ?? 0,
    ...[...shapes.values()].map((shape) => shape.right),
  );
  const legend = layoutLegend(
    timeline.lines,
    Math.max(labelsRight, metrics.maxWidth - metrics.margin),
    metrics,
  );
  const top = legend.bottom;

  const relative = placeVertically(events, assignment, shapes, origin, metrics);
  const placement = {
    eventY: relative.eventY.map((y) => y + top),
    bottom: relative.bottom + top,
  };
  const context = { events, assignment, placement, metrics, top };

  const mark = (
    line: string,
    kind: StationMark['kind'],
    x: number,
    y: number,
    shape: LabelShape,
  ) => ({
    line,
    kind,
    at: { x, y },
    label: positionLabel(shape.label, y),
    top: y - shape.above,
    bottom: y + shape.below,
  });
  const stations: StationMark[] = [];
  if (origin) stations.push(mark(MAIN_LINE_ID, 'origin', laneX(0, metrics), top, origin));
  events.forEach((event, index) => {
    if (event.kind !== 'station') return;
    const shape = shapes.get(index);
    const y = placement.eventY[index];
    if (!shape || y === undefined) throw new Error(`station event ${index} was not placed`);
    const x = laneX(assignment.laneOf(event.line.id), metrics);
    stations.push(mark(event.line.id, 'stop', x, y, shape));
  });

  return {
    width: Math.ceil(Math.max(labelsRight, legend.right) + metrics.margin),
    height: Math.ceil(placement.bottom + metrics.tailLength + metrics.margin),
    ...(timeline.title !== undefined && { title: timeline.title }),
    strokeWidth: metrics.strokeWidth,
    cornerRadius: metrics.cornerRadius,
    lines: timeline.lines.map((line) => ({
      id: line.id,
      color: line.color,
      ...(line.darkColor !== undefined && { darkColor: line.darkColor }),
    })),
    legend: legend.entries,
    tracks: buildTracks(timeline, context),
    bridges: buildBridges(crossings, context),
    stations,
  };
}
