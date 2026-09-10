import type { Line, Timeline } from '../model/timeline.ts';
import type { Crossing } from './crossings.ts';
import type { LaneAssignment } from './lanes.ts';
import type { LayoutMetrics } from './metrics.ts';
import type { LayoutEvent } from './order.ts';
import type { VerticalPlacement } from './vertical.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A line's centreline as a polyline; bends are rounded when drawn. */
export interface Track {
  readonly line: string;
  /** Depth of the line in the parent tree (main = 0); deeper lines are painted first. */
  readonly depth: number;
  readonly points: readonly Point[];
  /** Dotted continuation where an ongoing line runs off the map: at the bottom, or the top if reversed. */
  readonly tail?: { readonly from: Point; readonly to: Point };
}

/** A short piece of a diagonal redrawn over the line it crosses, on a background-coloured casing. */
export interface Bridge {
  readonly line: string;
  readonly from: Point;
  readonly to: Point;
}

interface Context {
  readonly events: readonly LayoutEvent[];
  readonly assignment: LaneAssignment;
  readonly placement: Pick<VerticalPlacement, 'eventY' | 'bottom'>;
  readonly metrics: LayoutMetrics;
  /** y of the top of the main line. */
  readonly top: number;
}

export function laneX(lane: number, metrics: LayoutMetrics): number {
  return metrics.left + lane * metrics.laneSpacing;
}

export function buildTracks(timeline: Timeline, context: Context): readonly Track[] {
  const { events, assignment, placement, metrics } = context;
  const indices = new Map<string, { branch?: number; merge?: number }>();
  events.forEach((event, index) => {
    if (event.kind === 'station') return;
    indices.set(event.line.id, { ...indices.get(event.line.id), [event.kind]: index });
  });

  const x = (lane: number) => laneX(lane, metrics);
  const yAt = (index: number) => {
    const y = placement.eventY[index];
    if (y === undefined) throw new Error(`event ${index} has no y`);
    return y;
  };
  // A line with no branch comes in from the top of the map, one with no merge runs off the bottom;
  // either way the open end continues as a dotted tail.
  const tailFrom = (end: Point, direction: 1 | -1) => ({
    from: end,
    to: { x: end.x, y: end.y + direction * metrics.tailLength },
  });
  const track = (
    line: Line,
    start: readonly Point[],
    end: readonly Point[],
    open: 'top' | 'bottom' | undefined,
  ): Track => {
    const points = [...start, ...end];
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last) throw new Error(`track "${line.id}" is empty`);
    return {
      line: line.id,
      depth: line.depth,
      points,
      ...(open === 'top' && { tail: tailFrom(first, -1) }),
      ...(open === 'bottom' && { tail: tailFrom(last, 1) }),
    };
  };

  return timeline.lines.map((line): Track => {
    if (line.parent === null) {
      return track(
        line,
        [{ x: x(0), y: context.top }],
        [{ x: x(0), y: placement.bottom }],
        timeline.reversed ? 'top' : 'bottom',
      );
    }

    const own = assignment.laneOf(line.id);
    const parent = assignment.laneOf(line.parent);
    const bend = Math.abs(own - parent) * metrics.laneSpacing;
    const { branch, merge } = indices.get(line.id) ?? {};
    if (branch === undefined && merge === undefined) {
      throw new Error(`line "${line.id}" neither branches nor merges`);
    }

    const start =
      branch === undefined
        ? [{ x: x(own), y: context.top }]
        : [
            { x: x(parent), y: yAt(branch) },
            { x: x(own), y: yAt(branch) + bend },
          ];
    const end =
      merge === undefined
        ? [{ x: x(own), y: placement.bottom }]
        : [
            { x: x(own), y: yAt(merge) },
            { x: x(parent), y: yAt(merge) + bend },
          ];
    return track(
      line,
      start,
      end,
      branch === undefined ? 'top' : merge === undefined ? 'bottom' : undefined,
    );
  });
}

export function buildBridges(crossings: readonly Crossing[], context: Context): readonly Bridge[] {
  const { events, assignment, placement, metrics } = context;
  const halfLength = metrics.strokeWidth * 1.4;

  return crossings.map(({ eventIndex, line, lane: crossedLane }): Bridge => {
    const event = events[eventIndex];
    const y = placement.eventY[eventIndex];
    if (!event || y === undefined || event.line.parent === null) {
      throw new Error(`crossing refers to a missing bend (event ${eventIndex})`);
    }
    const own = assignment.laneOf(event.line.id);
    const parent = assignment.laneOf(event.line.parent);
    const [from, to] = event.kind === 'merge' ? [own, parent] : [parent, own];

    const centre: Point = {
      x: laneX(crossedLane, metrics),
      y: y + Math.abs(crossedLane - from) * metrics.laneSpacing,
    };
    // Diagonals are at 45°: one unit across for one unit down.
    const step = halfLength / Math.SQRT2;
    const dx = Math.sign(to - from) * step;
    return {
      line,
      from: { x: centre.x - dx, y: centre.y - step },
      to: { x: centre.x + dx, y: centre.y + step },
    };
  });
}
