import type { Timeline } from '../model/timeline.ts';
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
  readonly points: readonly Point[];
  /** Dotted continuation below an ongoing line. */
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
  readonly placement: VerticalPlacement;
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
  const withTail = (line: string, points: readonly Point[]): Track => {
    const last = points.at(-1);
    if (!last) throw new Error(`track "${line}" is empty`);
    return {
      line,
      points,
      tail: { from: last, to: { x: last.x, y: last.y + metrics.tailLength } },
    };
  };

  return timeline.lines.map((line): Track => {
    if (line.parent === null) {
      return withTail(line.id, [
        { x: x(0), y: context.top },
        { x: x(0), y: placement.bottom },
      ]);
    }

    const own = assignment.laneOf(line.id);
    const parent = assignment.laneOf(line.parent);
    const bend = Math.abs(own - parent) * metrics.laneSpacing;
    const { branch, merge } = indices.get(line.id) ?? {};
    if (branch === undefined) throw new Error(`line "${line.id}" never branches`);

    const branchY = yAt(branch);
    const points: Point[] = [
      { x: x(parent), y: branchY },
      { x: x(own), y: branchY + bend },
    ];
    if (merge === undefined) {
      return withTail(line.id, [...points, { x: x(own), y: placement.bottom }]);
    }
    const mergeY = yAt(merge);
    return {
      line: line.id,
      points: [...points, { x: x(own), y: mergeY }, { x: x(parent), y: mergeY + bend }],
    };
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
