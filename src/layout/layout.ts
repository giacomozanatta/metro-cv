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
import { assignLanes, reverseAssignment } from './lanes.ts';
import { layoutLegend, type LegendEntry } from './legend.ts';
import { resolveMetrics, type LayoutMetrics } from './metrics.ts';
import { orderEvents, reverseEvents } from './order.ts';
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

  // A reversed map is the same map mirrored in time, newest first, so both share their lanes.
  const newestFirst = timeline.reversed;
  const chronological = orderEvents(timeline);
  const lanes = assignLanes(timeline, chronological);
  const events = newestFirst ? reverseEvents(chronological) : chronological;
  const assignment = newestFirst ? reverseAssignment(lanes, events.length) : lanes;
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
  // Newest first, ongoing lines fade out upwards, so their dotted tails need room below the legend.
  const top = legend.bottom + (newestFirst ? metrics.tailLength : 0);

  const relative = placeVertically(
    events,
    assignment,
    shapes,
    origin === undefined ? undefined : { label: origin, at: newestFirst ? 'bottom' : 'top' },
    metrics,
  );
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
  events.forEach((event, index) => {
    if (event.kind !== 'station') return;
    const shape = shapes.get(index);
    const y = placement.eventY[index];
    if (!shape || y === undefined) throw new Error(`station event ${index} was not placed`);
    const x = laneX(assignment.laneOf(event.line.id), metrics);
    stations.push(mark(event.line.id, 'stop', x, y, shape));
  });
  if (origin && relative.originY !== undefined) {
    const at = mark(MAIN_LINE_ID, 'origin', laneX(0, metrics), relative.originY + top, origin);
    if (newestFirst) stations.push(at);
    else stations.unshift(at);
  }

  return {
    width: Math.ceil(Math.max(labelsRight, legend.right) + metrics.margin),
    height: Math.ceil(
      Math.max(
        placement.bottom + (newestFirst ? 0 : metrics.tailLength),
        relative.labelBottom + top,
      ) + metrics.margin,
    ),
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
